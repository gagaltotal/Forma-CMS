import { z } from 'zod';
import type { Knex } from 'knex';
import { badRequest } from '../utils/errors.js';
import type { ContentType, FieldType, Filter, Op } from '../types/content.js';

/* Query-builder untuk tabel entri dinamis.
 * ATURAN EMAS: nama kolom hanya boleh berasal dari skema (whitelist) -- tidak pernah dari input mentah.
 * Semua nilai dikirim sebagai binding parameter; identifier di-quote oleh Knex (`??`). */

type Kind = 'str' | 'eq' | 'num' | 'bool' | 'json';
const KIND: Record<FieldType | 'id' | 'status' | 'ts', Kind> = {
  text: 'str', longtext: 'str', richtext: 'str', email: 'str', slug: 'str',
  enum: 'eq', media: 'eq', relation: 'eq', id: 'eq', status: 'eq',
  integer: 'num', float: 'num', datetime: 'num', ts: 'num', boolean: 'bool', json: 'json',
};
const ALLOWED_OPS: Record<Kind, readonly Op[]> = {
  str: ['eq', 'ne', 'contains', 'startsWith', 'in', 'null'],
  eq: ['eq', 'ne', 'in', 'null'],
  num: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'null'],
  bool: ['eq', 'ne', 'null'],
  json: ['null'],
};
const SYS_TS = new Set(['created_at', 'updated_at', 'published_at']);
/** Respons memakai camelCase (createdAt); sort/filter menerima keduanya. Hanya 3 alias tetap ini yang dipetakan. */
const SYS_ALIAS: Record<string, string> = { createdAt: 'created_at', updatedAt: 'updated_at', publishedAt: 'published_at' };
export const normCol = (name: string): string => Object.hasOwn(SYS_ALIAS, name) ? SYS_ALIAS[name]! : name;

/** Nama kolom HANYA boleh berasal dari skema (whitelist), tidak pernah dari input mentah. */
function colType(ct: ContentType, rawName: string): FieldType | 'id' | 'status' | 'ts' {
  const name = normCol(rawName);
  if (name === 'id') return 'id';
  if (name === 'status') return 'status';
  if (SYS_TS.has(name)) return 'ts';
  const f = ct.fields.find((x) => x.name === name);
  if (!f) throw badRequest(`Unknown field "${name.slice(0, 40)}"`);
  return f.type;
}

function coerce(type: FieldType | 'id' | 'status' | 'ts', v: string, field: string): string | number | boolean {
  const bad = () => badRequest(`Invalid value for "${field}"`);
  switch (type) {
    case 'integer': { const n = Number(v); if (!Number.isSafeInteger(n)) throw bad(); return n; }
    case 'float': { const n = Number(v); if (v.trim() === '' || !Number.isFinite(n)) throw bad(); return n; }
    case 'boolean': if (v !== 'true' && v !== 'false') throw bad(); return v === 'true';
    case 'datetime': { const t = Date.parse(v); if (Number.isNaN(t)) throw bad(); return new Date(t).toISOString(); }
    case 'ts': { const t = Date.parse(v); if (Number.isNaN(t)) throw bad(); return t; }
    case 'id': case 'media': case 'relation': if (!z.string().uuid().safeParse(v).success) throw bad(); return v;
    case 'status': if (v !== 'draft' && v !== 'published') throw bad(); return v;
    default: return v;
  }
}

export const likeEsc = (s: string) => s.toLowerCase().replace(/[!%_]/g, (c) => `!${c}`);

export function applyFilter(qb: Knex.QueryBuilder, ct: ContentType, f: Filter): void {
  const type = colType(ct, f.field);
  const kind = KIND[type];
  if (!ALLOWED_OPS[kind].includes(f.op)) throw badRequest(`Operator "${f.op}" is not allowed on "${f.field}"`);
  const col = normCol(f.field); // colType() di atas sudah memastikan nama ini ada di whitelist skema
  if (f.op === 'in') {
    const arr = (Array.isArray(f.value) ? f.value : String(f.value).split(',')).slice(0, 50);
    qb.whereIn(col, arr.map((x) => coerce(type, x, col)) as Knex.Value[]);
    return;
  }
  if (Array.isArray(f.value)) throw badRequest(`Operator "${f.op}" takes a single value`);
  const v = f.value;
  switch (f.op) {
    case 'null': v === 'false' ? qb.whereNotNull(col) : qb.whereNull(col); break;
    case 'eq': qb.where(col, coerce(type, v, col) as Knex.Value); break;
    case 'ne': qb.where(col, '<>', coerce(type, v, col) as Knex.Value); break;
    case 'gt': qb.where(col, '>', coerce(type, v, col) as Knex.Value); break;
    case 'gte': qb.where(col, '>=', coerce(type, v, col) as Knex.Value); break;
    case 'lt': qb.where(col, '<', coerce(type, v, col) as Knex.Value); break;
    case 'lte': qb.where(col, '<=', coerce(type, v, col) as Knex.Value); break;
    case 'contains': qb.whereRaw("lower(??) like ? escape '!'", [col, `%${likeEsc(v)}%`]); break;
    case 'startsWith': qb.whereRaw("lower(??) like ? escape '!'", [col, `${likeEsc(v)}%`]); break;
  }
}

export function parseSort(ct: ContentType, sort?: string): Array<[string, 'asc' | 'desc']> {
  if (!sort) return [['created_at', 'desc']];
  return sort.split(',').slice(0, 3).map((part) => {
    const m = /^([A-Za-z][A-Za-z0-9_]*)(?::(asc|desc))?$/.exec(part.trim());
    if (!m) throw badRequest('Invalid sort parameter');
    const t = colType(ct, m[1]!);
    if (t === 'json' || t === 'richtext' || t === 'longtext') throw badRequest(`Cannot sort by "${m[1]}"`);
    return [normCol(m[1]!), (m[2] as 'asc' | 'desc') ?? 'asc'];
  });
}
