import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Config } from '../config/index.js';
import type { MediaModel, MediaRow } from '../models/media.model.js';
import type { Principal } from '../security/permissions.js';
import { safeDisplayName, stripControl } from '../security/sanitize.js';
import { safeJoin, sniff } from '../security/upload.js';
import { uuid } from '../security/tokens.js';
import { badRequest, HttpError, notFound } from '../utils/errors.js';
import { mediaPatchBody } from '../validators/media.validator.js';
import { parseWith } from '../validators/parse.js';
import type { AuditService } from './audit.service.js';
import type { ContentService } from './content.service.js';

export class MediaService {
  private root: string;
  constructor(private cfg: Config, private media: MediaModel, private content: ContentService, private audit: AuditService) {
    this.root = path.resolve(cfg.UPLOAD_DIR);
  }
  async init(): Promise<void> { await fs.mkdir(this.root, { recursive: true, mode: 0o750 }); }

  async list(q: { page: number; pageSize: number; q?: string }) {
    const { rows, total } = await this.media.list(q);
    return { data: rows.map(this.content.mediaView), meta: { page: q.page, pageSize: q.pageSize, total } };
  }

  /** Menyimpan file yang sudah dibaca ke memori (ukuran sudah dibatasi oleh multipart). */
  async upload(actor: Principal, file: { filename: string; buffer: Buffer }) {
    if (!file.buffer.length) throw badRequest('The file is empty');
    const kind = sniff(file.buffer);
    if (!kind) throw new HttpError(415, 'unsupported_type', 'Only PNG, JPEG, GIF, WebP and PDF files are allowed');

    const id = uuid();
    const stored = `${id}.${kind.ext}`; // nama di disk sepenuhnya dibuat server
    await fs.writeFile(safeJoin(this.root, stored), file.buffer, { flag: 'wx', mode: 0o640 });
    const row: MediaRow = {
      id, stored_name: stored, original_name: safeDisplayName(file.filename), mime: kind.mime, size: file.buffer.length,
      sha256: crypto.createHash('sha256').update(file.buffer).digest('hex'), alt: '',
      uploaded_by: actor.kind === 'user' ? actor.id : null, created_at: Date.now(),
    };
    await this.media.insert(row);
    await this.audit.log('media.upload', actor.id, id, actor.ip, { mime: kind.mime, size: file.buffer.length });
    return this.content.mediaView(row);
  }

  async update(id: string, raw: unknown) {
    const b = parseWith(mediaPatchBody, raw);
    const patch: Partial<MediaRow> = {};
    if (b.alt !== undefined) patch.alt = stripControl(b.alt);
    if (b.name !== undefined) patch.original_name = safeDisplayName(b.name);
    if (!Object.keys(patch).length) throw badRequest('Nothing to update');
    if (!(await this.media.update(id, patch))) throw notFound('Media not found');
    return this.content.mediaView((await this.media.find(id))!);
  }

  async remove(actor: Principal, id: string): Promise<void> {
    const row = await this.media.find(id);
    if (!row) throw notFound('Media not found');
    await this.media.delete(id);
    await this.content.detachMedia(id);
    await fs.unlink(safeJoin(this.root, row.stored_name)).catch((e) => { if (e?.code !== 'ENOENT') throw e; });
    await this.audit.log('media.delete', actor.id, id, actor.ip);
  }

  /** Untuk penyajian file publik: ID -> baris DB -> path tervalidasi. Tidak ada path dari user yang menyentuh filesystem. */
  async locate(id: string): Promise<{ row: MediaRow; file: string }> {
    const row = await this.media.find(id);
    if (!row) throw notFound();
    try { return { row, file: safeJoin(this.root, row.stored_name) }; } catch { throw notFound(); }
  }
}
