import type { ContentType, Entry } from '../types/content.js';

/* Pemetaan baris database <-> objek API (camelCase untuk kolom sistem, nama field apa adanya untuk field kustom). */

const iso = (ms: unknown) => new Date(Number(ms)).toISOString();
export const selectCols = (ct: ContentType) => ['id', 'status', 'created_at', 'updated_at', 'published_at', ...ct.fields.map((f) => f.name)];

export function toRow(ct: ContentType, data: Record<string, unknown>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const f of ct.fields) {
    if (!Object.hasOwn(data, f.name)) continue;
    const v = data[f.name];
    row[f.name] = v === undefined || v === null ? null : f.type === 'json' ? JSON.stringify(v) : v;
  }
  return row;
}

export function fromRow(ct: ContentType, r: any): Entry {
  const o: Entry = {
    id: r.id, status: r.status, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
    publishedAt: r.published_at == null ? null : iso(r.published_at),
  };
  for (const f of ct.fields) {
    const v = r[f.name];
    if (v === null || v === undefined) { o[f.name] = null; continue; }
    switch (f.type) {
      case 'boolean': o[f.name] = Boolean(v); break;
      case 'integer': case 'float': o[f.name] = Number(v); break;
      case 'json': try { o[f.name] = JSON.parse(v); } catch { o[f.name] = null; } break;
      default: o[f.name] = v;
    }
  }
  return o;
}
