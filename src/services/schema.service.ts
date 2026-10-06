import type { Db } from '../database/connection.js';
import type { Principal } from '../security/permissions.js';
import type { AuditService } from './audit.service.js';
import type { ContentTypeModel } from '../models/content-type.model.js';
import type { EntryModel } from '../models/entry.model.js';
import type { ContentType } from '../types/content.js';
import { badRequest, conflict, isUniqueViolation, notFound } from '../utils/errors.js';
import { pascal, pluralize } from '../utils/naming.js';
import { uuid } from '../security/tokens.js';
import { contentTypeInput, RESERVED_API, RESERVED_FIELDS, RESERVED_GQL, type ContentTypeInput } from '../validators/content-type.validator.js';
import { parseWith } from '../validators/parse.js';

/**
 * Registry tipe konten: cache in-memory + orkestrasi DDL.
 * Perubahan skema diserialisasi (`exclusive`) dan dibungkus transaksi bersama metadata-nya.
 */
export class SchemaService {
  private map = new Map<string, ContentType>();
  /** Naik setiap kali skema berubah; dipakai GraphQL untuk membangun ulang schema. */
  version = 0;
  private lock: Promise<unknown> = Promise.resolve();

  constructor(private db: Db, private types: ContentTypeModel, private entries: EntryModel, private audit: AuditService) {}

  async load(): Promise<void> {
    this.map = new Map((await this.types.all()).map((c) => [c.apiId, c]));
    this.version++;
  }

  list(): ContentType[] { return [...this.map.values()]; }
  get(apiId: string): ContentType | undefined { return this.map.get(apiId); }
  require(apiId: string): ContentType {
    const ct = this.map.get(apiId);
    if (!ct) throw notFound(`Unknown content type "${apiId.slice(0, 40)}"`);
    return ct;
  }

  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.lock.then(fn, fn);
    this.lock = p.catch(() => undefined);
    return p;
  }

  private validate(input: ContentTypeInput, self?: ContentType): string {
    const others = this.list().filter((c) => c.apiId !== self?.apiId);
    if (RESERVED_API.has(input.apiId)) throw badRequest(`"${input.apiId}" is a reserved name`);
    const pluralId = input.pluralId ?? pluralize(input.apiId);
    if (RESERVED_API.has(pluralId)) throw badRequest(`"${pluralId}" is a reserved name`);
    if (pluralId === input.apiId) throw badRequest('Plural name must differ from the singular name');

    const taken = new Set<string>();
    const gql = new Set<string>();
    for (const c of others) {
      taken.add(c.apiId); taken.add(c.pluralId);
      gql.add(pascal(c.apiId)); gql.add(`${pascal(c.apiId)}Page`);
    }
    if (taken.has(input.apiId) || taken.has(pluralId)) throw conflict('Another content type already uses this API name');
    const P = pascal(input.apiId);
    if (RESERVED_GQL.has(P) || RESERVED_GQL.has(`${P}Page`) || gql.has(P) || gql.has(`${P}Page`)) {
      throw conflict('This name collides with another GraphQL type');
    }

    const seen = new Set<string>();
    let slugs = 0;
    for (const f of input.fields) {
      if (RESERVED_FIELDS.has(f.name)) throw badRequest(`Field name "${f.name}" is reserved`);
      if (seen.has(f.name)) throw badRequest(`Duplicate field "${f.name}"`);
      seen.add(f.name);
      if (f.type === 'slug' && ++slugs > 1) throw badRequest('Only one slug field is allowed');
      if (f.unique && !['text', 'email', 'slug', 'enum', 'datetime', 'integer', 'float', 'boolean', 'media', 'relation'].includes(f.type)) {
        throw badRequest(`Field "${f.name}": this type cannot be unique`);
      }
      if (f.type === 'enum' && !f.values?.length) throw badRequest(`Enum field "${f.name}" needs at least one value`);
      if (f.type === 'enum' && new Set(f.values).size !== f.values!.length) throw badRequest(`Enum "${f.name}" has duplicate values`);
      if (f.type === 'relation') {
        if (!f.target) throw badRequest(`Relation "${f.name}" needs a target`);
        if (f.target !== input.apiId && !this.map.has(f.target)) throw badRequest(`Relation target "${f.target}" does not exist`);
      }
      if (f.min !== undefined && f.max !== undefined && f.min > f.max) throw badRequest(`Field "${f.name}": min is greater than max`);
    }
    return pluralId;
  }

  create(raw: unknown, actor?: Principal): Promise<ContentType> {
    return this.exclusive(async () => {
      const input = parseWith(contentTypeInput, raw);
      const pluralId = this.validate(input);
      const now = Date.now();
      const ct: ContentType = { id: uuid(), apiId: input.apiId, pluralId, displayName: input.displayName, fields: input.fields, createdAt: now, updatedAt: now };
      await this.db.transaction(async (trx) => {
        await this.entries.createTable(ct, trx);
        await this.types.insert(ct, trx);
      });
      this.map.set(ct.apiId, ct);
      this.version++;
      await this.audit.log('schema.create', actor?.id ?? null, ct.apiId, actor?.ip ?? null);
      return ct;
    });
  }

  update(apiId: string, raw: unknown, actor?: Principal): Promise<ContentType> {
    return this.exclusive(async () => {
      const cur = this.require(apiId);
      const input = parseWith(contentTypeInput, raw);
      if (input.apiId !== cur.apiId) throw badRequest('apiId cannot be changed');
      const pluralId = this.validate(input, cur);

      const before = new Map(cur.fields.map((f) => [f.name, f]));
      const after = new Map(input.fields.map((f) => [f.name, f]));
      const changed: Array<{ from: typeof cur.fields[number]; to: typeof input.fields[number] }> = [];
      for (const [name, f] of after) {
        const old = before.get(name);
        if (old && (old.type !== f.type || (old.type !== 'slug' && old.unique !== f.unique))) changed.push({ from: old, to: f });
        if (old?.type === 'relation' && f.type === 'relation' && old.target !== f.target) throw badRequest(`Field "${name}": relation target cannot be changed`);
      }
      const added = input.fields.filter((f) => !before.has(f.name));
      const removed = cur.fields.filter((f) => !after.has(f.name));
      const next: ContentType = { ...cur, pluralId, displayName: input.displayName, fields: input.fields, updatedAt: Date.now() };

      try {
        await this.db.transaction(async (trx) => {
          await this.entries.alterTable(cur.apiId, added, removed, changed, trx);
          await this.types.update(next, trx);
        });
      } catch (error) {
        if (isUniqueViolation(error)) throw conflict('Existing values prevent this field from being unique');
        throw error;
      }
      this.map.set(cur.apiId, next);
      this.version++;
      await this.audit.log('schema.update', actor?.id ?? null, apiId, actor?.ip ?? null);
      return next;
    });
  }

  remove(apiId: string, actor?: Principal): Promise<void> {
    return this.exclusive(async () => {
      const cur = this.require(apiId);
      const dependents = this.list().filter((c) => c.apiId !== apiId && c.fields.some((f) => f.type === 'relation' && f.target === apiId));
      if (dependents.length) throw conflict(`Still referenced by: ${dependents.map((d) => d.apiId).join(', ')}`);
      await this.db.transaction(async (trx) => {
        await this.entries.dropTable(cur.apiId, trx);
        await this.types.delete(cur.id, trx);
      });
      this.map.delete(apiId);
      this.version++;
      await this.audit.log('schema.delete', actor?.id ?? null, apiId, actor?.ip ?? null);
    });
  }
}
