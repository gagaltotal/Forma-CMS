import { z } from 'zod';
import type { AuditService } from './audit.service.js';
import type { SchemaService } from './schema.service.js';
import type { VersionService } from './version.service.js';
import type { EntryModel } from '../models/entry.model.js';
import { fromRow, toRow } from '../models/entry.mapper.js';
import type { MediaModel, MediaRow } from '../models/media.model.js';
import { badRequest, conflict, forbidden, isUniqueViolation, notFound, unauthorized } from '../utils/errors.js';
import { can, type Principal } from '../security/permissions.js';
import { uuid } from '../security/tokens.js';
import type { ContentType, Entry, ListParams, MediaView } from '../types/content.js';
import { createEnvelope, updateEnvelope } from '../validators/entry.validator.js';
import { parseWith } from '../validators/parse.js';

const isUuid = (v: string) => z.string().uuid().safeParse(v).success;

/**
 * Logika bisnis konten: otorisasi RBAC per tipe, draft/publish, validasi referensi,
 * populate relasi/media, dan audit. Tidak ada SQL di sini (itu tugas EntryModel).
 */
export class ContentService {
  constructor(
    private deps: { schema: SchemaService; entries: EntryModel; media: MediaModel; audit: AuditService; publicOrigin: string; versions?: VersionService },
  ) {}

  private get schema() { return this.deps.schema; }
  private get entries() { return this.deps.entries; }

  mediaView = (r: MediaRow): MediaView => ({
    id: r.id, url: `${this.deps.publicOrigin}/media/file/${r.id}`, name: r.original_name, mime: r.mime, size: Number(r.size), alt: r.alt ?? '',
  });

  private need(p: Principal, perm: string): void {
    if (!can(p.perms, perm)) throw p.kind === 'public' ? unauthorized() : forbidden();
  }
  private actor = (p: Principal) => (p.id ? `${p.kind}:${p.id}` : 'public');
  private canDrafts = (p: Principal, apiId: string) => can(p.perms, `content:${apiId}:drafts`);

  /* ---------------- Baca ---------------- */

  async list(p: Principal, apiId: string, params: ListParams): Promise<{ data: Entry[]; meta: { page: number; pageSize: number; total: number } }> {
    const ct = this.schema.require(apiId);
    this.need(p, `content:${apiId}:read`);
    const { rows, total } = await this.entries.list(ct, {
      seeDrafts: this.canDrafts(p, apiId), filters: params.filter, q: params.q, sort: params.sort, page: params.page, pageSize: params.pageSize,
    });
    const data = rows.map((r) => fromRow(ct, r));
    if (params.populate) await this.populate(p, ct, data, params.populate);
    return { data, meta: { page: params.page, pageSize: params.pageSize, total } };
  }

  async get(p: Principal, apiId: string, id: string, populate?: string): Promise<Entry> {
    const ct = this.schema.require(apiId);
    this.need(p, `content:${apiId}:read`);
    const e = await this.fetchVisible(p, ct, id);
    if (populate) await this.populate(p, ct, [e], populate);
    return e;
  }

  /** Untuk resolver relasi GraphQL: null jika tidak ada / tidak boleh dilihat (tidak melempar). */
  async getOptional(p: Principal, apiId: string, id: string): Promise<Entry | null> {
    try { return await this.get(p, apiId, id); } catch { return null; }
  }

  async mediaById(id: string): Promise<MediaView | null> {
    if (!isUuid(id)) return null;
    const r = await this.deps.media.find(id);
    return r ? this.mediaView(r) : null;
  }

  private async fetchVisible(p: Principal, ct: ContentType, id: string): Promise<Entry> {
    if (!isUuid(id)) throw notFound();
    const r = await this.entries.find(ct, id);
    // Draft disembunyikan (404, bukan 403) dari yang tidak berhak agar keberadaannya tidak bocor.
    if (!r || (r.status !== 'published' && !this.canDrafts(p, ct.apiId))) throw notFound();
    return fromRow(ct, r);
  }

  /* ---------------- Tulis ---------------- */

  async create(p: Principal, apiId: string, body: unknown): Promise<Entry> {
    const ct = this.schema.require(apiId);
    this.need(p, `content:${apiId}:create`);
    const env = parseWith(createEnvelope(ct), body);
    const status = env.status ?? 'draft';
    if (status === 'published') this.need(p, `content:${apiId}:publish`);
    await this.checkRefs(p, ct, env.data);

    const id = uuid(), now = Date.now();
    try {
      await this.entries.insert(apiId, {
        id, status, created_by: p.kind === 'user' ? p.id : null, created_at: now, updated_at: now,
        published_at: status === 'published' ? now : null, ...toRow(ct, env.data),
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw conflict('A unique value (for example a slug) is already in use');
      throw e;
    }
    await this.deps.audit.log('content.create', this.actor(p), `${apiId}/${id}`, p.ip);
    const created = fromRow(ct, await this.entries.find(ct, id));
    // Snapshot versi pertama setelah create
    if (this.deps.versions) {
      await this.deps.versions.createVersion({
        entryId: id, data: env.data, status,
        createdBy: p.kind === 'user' ? p.id : null,
        changeSummary: 'Initial version',
      });
    }
    return created;
  }

  async update(p: Principal, apiId: string, id: string, body: unknown): Promise<Entry> {
    const ct = this.schema.require(apiId);
    this.need(p, `content:${apiId}:update`);
    const cur = await this.fetchVisible(p, ct, id);
    const env = parseWith(updateEnvelope(ct), body);
    if (!env.data && !env.status) throw badRequest('Nothing to update');

    const patch: Record<string, unknown> = { updated_at: Date.now() };
    if (env.status && env.status !== cur.status) {
      this.need(p, `content:${apiId}:publish`);
      patch.status = env.status;
      patch.published_at = env.status === 'published' ? Date.now() : null;
    }
    if (env.data) {
      await this.checkRefs(p, ct, env.data);
      Object.assign(patch, toRow(ct, env.data));
    }
    try {
      await this.entries.update(apiId, id, patch);
    } catch (e) {
      if (isUniqueViolation(e)) throw conflict('A unique value (for example a slug) is already in use');
      throw e;
    }
    await this.deps.audit.log(patch.status ? `content.${patch.status === 'published' ? 'publish' : 'unpublish'}` : 'content.update', this.actor(p), `${apiId}/${id}`, p.ip);
    const updated = fromRow(ct, await this.entries.find(ct, id));
    // Snapshot setelah update: gabungkan nilai field saat ini dengan perubahan.
    if (this.deps.versions) {
      const snapshot: Record<string, unknown> = {};
      for (const f of ct.fields) snapshot[f.name] = cur[f.name] ?? null;
      Object.assign(snapshot, env.data ?? {});
      const newStatus = (patch.status as 'draft' | 'published') || cur.status;
      await this.deps.versions.createVersion({
        entryId: id, data: snapshot, status: newStatus,
        createdBy: p.kind === 'user' ? p.id : null,
        changeSummary: patch.status ? `Changed status to ${newStatus}` : undefined,
      });
    }
    return updated;
  }

  async remove(p: Principal, apiId: string, id: string): Promise<void> {
    const ct = this.schema.require(apiId);
    this.need(p, `content:${apiId}:delete`);
    await this.fetchVisible(p, ct, id);
    // Hapus versions terlebih dahulu sebelum entry
    if (this.deps.versions) {
      await this.deps.versions.deleteVersions(id);
    }
    await this.entries.remove(apiId, id);
    for (const other of this.schema.list()) {
      for (const f of other.fields) {
        if (f.type === 'relation' && f.target === apiId) await this.entries.clearReference(other.apiId, f.name, id);
      }
    }
    await this.deps.audit.log('content.delete', this.actor(p), `${apiId}/${id}`, p.ip);
  }

  /** Dipanggil saat file media dihapus: kosongkan referensi agar tidak menggantung. */
  async detachMedia(mediaId: string): Promise<void> {
    for (const ct of this.schema.list()) {
      for (const f of ct.fields) if (f.type === 'media') await this.entries.clearReference(ct.apiId, f.name, mediaId);
    }
  }

  /* ---------------- Referensi & populate ---------------- */

  /** Referensi (media/relasi) harus ada, dan pemanggil harus berhak membaca target -> tidak ada oracle keberadaan data. */
  private async checkRefs(p: Principal, ct: ContentType, data: Record<string, unknown>): Promise<void> {
    for (const f of ct.fields) {
      const v = data[f.name];
      if (typeof v !== 'string') continue;
      if (f.type === 'media') {
        this.need(p, 'media:read');
        if (!(await this.deps.media.exists(v))) throw badRequest(`"${f.name}" refers to a media file that does not exist`);
      } else if (f.type === 'relation') {
        const target = f.target!;
        this.need(p, `content:${target}:read`);
        if (!(await this.entries.existsVisible(target, v, !this.canDrafts(p, target)))) throw badRequest(`"${f.name}" refers to an entry that does not exist`);
      }
    }
  }

  private async populate(p: Principal, ct: ContentType, entries: Entry[], spec: string): Promise<void> {
    const names = [...new Set(spec.split(',').map((s) => s.trim()).filter(Boolean))].slice(0, 10);
    for (const name of names) {
      const f = ct.fields.find((x) => x.name === name);
      if (!f || (f.type !== 'relation' && f.type !== 'media')) throw badRequest(`Cannot populate "${name.slice(0, 40)}"`);
      const ids = [...new Set(entries.map((e) => e[name]).filter((x): x is string => typeof x === 'string'))];
      if (!ids.length) continue;
      const found = new Map<string, unknown>();
      if (f.type === 'media') {
        (await this.deps.media.findMany(ids)).forEach((r) => found.set(r.id, this.mediaView(r)));
      } else {
        const tct = this.schema.require(f.target!);
        if (!can(p.perms, `content:${tct.apiId}:read`)) continue; // tidak berhak -> biarkan berupa id saja
        (await this.entries.findMany(tct, ids, !this.canDrafts(p, tct.apiId))).forEach((r) => found.set(r.id, fromRow(tct, r)));
      }
      for (const e of entries) if (typeof e[name] === 'string') e[name] = found.get(e[name] as string) ?? null;
    }
  }
}
