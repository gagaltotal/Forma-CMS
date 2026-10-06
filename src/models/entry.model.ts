import type { Knex } from 'knex';
import { createHash } from 'node:crypto';
import { tbl } from '../utils/naming.js';
import type { ContentType, FieldDef, Filter } from '../types/content.js';
import { BaseModel, type Conn } from './base.model.js';
import { applyFilter, likeEsc, parseSort } from './entry.query.js';
import { selectCols } from './entry.mapper.js';
import { badRequest } from '../utils/errors.js';
import { parseFieldValue } from '../validators/entry.validator.js';

export interface ListOptions {
  seeDrafts: boolean; filters?: Filter[]; q?: string; sort?: string; page: number; pageSize: number;
}

function addColumn(t: Knex.CreateTableBuilder | Knex.AlterTableBuilder, f: FieldDef): void {
  let c: Knex.ColumnBuilder;
  switch (f.type) {
    case 'text': case 'email': c = t.string(f.name, 255); break;
    case 'slug': c = t.string(f.name, 160); break;
    case 'enum': c = t.string(f.name, 64); break;
    case 'datetime': c = t.string(f.name, 40); break;
    case 'longtext': case 'richtext': case 'json': c = t.text(f.name, 'longtext'); break;
    case 'integer': c = t.integer(f.name); break;
    case 'float': c = t.double(f.name); break;
    case 'boolean': c = t.boolean(f.name); break;
    case 'media': case 'relation': c = t.string(f.name, 36); break;
  }
  c.nullable();
}

const uniqueIndexName = (apiId: string, name: string) => `forma_u_${createHash('sha1').update(`${apiId}:${name}`).digest('hex').slice(0, 16)}`;
const isUnique = (f: FieldDef) => f.type === 'slug' || f.unique === true;
const isIndexed = (f: FieldDef) => f.type === 'media' || f.type === 'relation';

function convertFieldValue(value: unknown, from: FieldDef, to: FieldDef): unknown {
  if (value === null || value === undefined || from.type === to.type) return value;
  let parsed = value;
  if (from.type === 'json' && typeof value === 'string') {
    try { parsed = JSON.parse(value); } catch { throw badRequest(`Field "${from.name}": stored JSON cannot be converted`); }
  } else if (from.type === 'boolean') parsed = Boolean(value);
  else if ((from.type === 'integer' || from.type === 'float') && typeof value === 'string') parsed = Number(value);

  if (to.type === 'integer' || to.type === 'float') {
    if (typeof parsed === 'string' && !parsed.trim()) throw badRequest(`Field "${to.name}": existing values cannot be converted to ${to.type}`);
    const number = typeof parsed === 'number' ? parsed : Number(parsed);
    if (!Number.isFinite(number) || (to.type === 'integer' && !Number.isInteger(number))) {
      throw badRequest(`Field "${to.name}": existing values cannot be converted to ${to.type}`);
    }
    parsed = number;
  }
  if (to.type === 'boolean') {
    if (typeof parsed === 'string') parsed = parsed.trim().toLowerCase();
    if (parsed === 1 || parsed === '1' || parsed === 'true') parsed = true;
    else if (parsed === 0 || parsed === '0' || parsed === 'false') parsed = false;
    else if (parsed !== true && parsed !== false) throw badRequest(`Field "${to.name}": existing values cannot be converted to boolean`);
  }
  if (to.type === 'json') {
    if (typeof parsed === 'string') {
      try { parsed = JSON.parse(parsed); } catch { /* Store ordinary text as a JSON string. */ }
    }
  }
  if (['text', 'longtext', 'richtext', 'email', 'slug', 'enum', 'datetime', 'media', 'relation'].includes(to.type) && typeof parsed !== 'string') {
    parsed = typeof parsed === 'object' ? JSON.stringify(parsed) : String(parsed);
  }
  try {
    const converted = parseFieldValue(to, parsed);
    return to.type === 'json' ? JSON.stringify(converted) : converted;
  } catch {
    throw badRequest(`Field "${to.name}": existing values cannot be converted to ${to.type}`);
  }
}

/** Akses data untuk tabel `ct_<apiId>` yang dibuat dinamis dari definisi tipe konten (DDL + query). */
export class EntryModel extends BaseModel {
  /* ---------- DDL ---------- */
  async createTable(ct: ContentType, trx: Conn): Promise<void> {
    const table = tbl(ct.apiId);
    await (trx as Knex).schema.createTable(table, (t) => {
      t.string('id', 36).primary();
      t.string('status', 16).notNullable().defaultTo('draft').index();
      t.string('created_by', 36).nullable();
      t.bigInteger('created_at').notNullable().index();
      t.bigInteger('updated_at').notNullable();
      t.bigInteger('published_at').nullable();
      ct.fields.forEach((f) => addColumn(t, f));
    });
    for (const field of ct.fields) await this.createIndexes(ct.apiId, field, trx);
  }
  async alterTable(apiId: string, added: FieldDef[], removed: FieldDef[], changed: Array<{ from: FieldDef; to: FieldDef }>, trx: Conn): Promise<void> {
    if (!added.length && !removed.length && !changed.length) return;
    const table = tbl(apiId);
    for (const field of [...removed, ...changed.map((pair) => pair.from)]) await this.dropIndexes(apiId, field, trx);
    const temporaryNames = new Map(changed.map(({ from }) => [from.name, `__forma_${from.name}`]));
    await (trx as Knex).schema.alterTable(table, (t) => {
      added.forEach((f) => addColumn(t, f));
      changed.forEach(({ to }) => addColumn(t, { ...to, name: temporaryNames.get(to.name)! }));
    });
    for (const { from, to } of changed) {
      const temporary = temporaryNames.get(from.name)!;
      const connection = trx as Knex;
      let cursor = '';
      for (;;) {
        const rows = await connection(table).select('id', from.name).where('id', '>', cursor).orderBy('id', 'asc').limit(500);
        if (!rows.length) break;
        for (const row of rows) {
          await connection(table).where({ id: row.id }).update({ [temporary]: convertFieldValue(row[from.name], from, to) });
        }
        cursor = String(rows[rows.length - 1]!.id);
      }
    }
    if (removed.length || changed.length) {
      await (trx as Knex).schema.alterTable(table, (t) => {
        removed.forEach((f) => t.dropColumn(f.name));
        changed.forEach(({ from }) => t.dropColumn(from.name));
      });
    }
    if (changed.length) {
      await (trx as Knex).schema.alterTable(table, (t) => {
        changed.forEach(({ from }) => t.renameColumn(temporaryNames.get(from.name)!, from.name));
      });
    }
    for (const field of [...added, ...changed.map((pair) => pair.to)]) await this.createIndexes(apiId, field, trx);
  }

  private async createIndexes(apiId: string, field: FieldDef, trx: Conn): Promise<void> {
    if (!isUnique(field) && !isIndexed(field)) return;
    await (trx as Knex).schema.alterTable(tbl(apiId), (t) => {
      if (isUnique(field)) t.unique([field.name], uniqueIndexName(apiId, field.name));
      if (isIndexed(field)) t.index([field.name]);
    });
  }

  private async dropIndexes(apiId: string, field: FieldDef, trx: Conn): Promise<void> {
    if (field.type === 'slug') return;
    if (!field.unique && !isIndexed(field)) return;
    await (trx as Knex).schema.alterTable(tbl(apiId), (t) => {
      if (field.unique) t.dropUnique([field.name], uniqueIndexName(apiId, field.name));
      if (isIndexed(field)) t.dropIndex([field.name]);
    });
  }
  async dropTable(apiId: string, trx: Conn): Promise<void> { await (trx as Knex).schema.dropTableIfExists(tbl(apiId)); }

  /* ---------- Query ---------- */
  async list(ct: ContentType, o: ListOptions): Promise<{ rows: any[]; total: number }> {
    const base = this.db(tbl(ct.apiId));
    if (!o.seeDrafts) base.where('status', 'published');
    for (const f of o.filters ?? []) applyFilter(base, ct, f);
    if (o.q) {
      const like = `%${likeEsc(o.q)}%`;
      const cols = ct.fields.filter((f) => ['text', 'longtext', 'email', 'slug'].includes(f.type)).map((f) => f.name);
      if (cols.length) base.where((b) => { for (const c of cols) b.orWhereRaw("lower(??) like ? escape '!'", [c, like]); });
    }
    const totalRow: any = await base.clone().count({ c: '*' }).first();
    const q = base.clone().select(selectCols(ct));
    for (const [col, dir] of parseSort(ct, o.sort)) q.orderBy(col, dir);
    q.orderBy('id', 'asc').limit(o.pageSize).offset((o.page - 1) * o.pageSize);
    return { rows: await q, total: Number(totalRow?.c ?? 0) };
  }

  find(ct: ContentType, id: string): Promise<any | undefined> {
    return this.db(tbl(ct.apiId)).where({ id }).first(selectCols(ct));
  }
  findMany(ct: ContentType, ids: string[], onlyPublished: boolean): Promise<any[]> {
    const q = this.db(tbl(ct.apiId)).whereIn('id', ids).select(selectCols(ct));
    if (onlyPublished) q.where('status', 'published');
    return q;
  }
  async existsVisible(apiId: string, id: string, onlyPublished: boolean): Promise<boolean> {
    const q = this.db(tbl(apiId)).where({ id });
    if (onlyPublished) q.where('status', 'published');
    return !!(await q.first('id'));
  }

  /* ---------- Tulis ---------- */
  insert(apiId: string, row: Record<string, unknown>): Promise<unknown> { return this.db(tbl(apiId)).insert(row); }
  update(apiId: string, id: string, patch: Record<string, unknown>): Promise<number> { return this.db(tbl(apiId)).where({ id }).update(patch); }
  remove(apiId: string, id: string): Promise<number> { return this.db(tbl(apiId)).where({ id }).delete(); }
  /** Kosongkan referensi (relasi/media) yang menunjuk ke `value` pada kolom `column`. */
  clearReference(apiId: string, column: string, value: string): Promise<number> {
    return this.db(tbl(apiId)).where(column, value).update({ [column]: null });
  }
}
