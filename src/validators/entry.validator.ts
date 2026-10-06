import { z } from 'zod';
import { cleanRichText, stripControl } from '../security/sanitize.js';
import type { ContentType, FieldDef } from '../types/content.js';

/* Validasi data entri berdasarkan skema tipe konten.
 * `.strict()` => field tak dikenal/field sistem ditolak (anti mass-assignment & parameter tampering). */

const INT_MIN = -2147483648, INT_MAX = 2147483647;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function jsonOk(v: unknown, depth = 0, budget = { n: 0 }): boolean {
  if (depth > 10 || ++budget.n > 5000) return false;
  if (v === null || typeof v !== 'object') return typeof v !== 'function' && typeof v !== 'bigint' && typeof v !== 'symbol';
  if (Array.isArray(v)) return v.every((x) => jsonOk(x, depth + 1, budget));
  return Object.entries(v).every(([k, x]) => !FORBIDDEN_KEYS.has(k) && jsonOk(x, depth + 1, budget));
}

/** Field wajib tidak boleh kosong / hanya spasi (setelah transformasi & sanitasi). */
function nonBlank(f: FieldDef, schema: z.ZodTypeAny): z.ZodTypeAny {
  return f.required ? schema.refine((v: string) => v.trim().length > 0, 'This field is required') : schema;
}

function fieldZod(f: FieldDef): z.ZodTypeAny {
  switch (f.type) {
    case 'text': {
      let s = z.string().max(Math.min(f.max ?? 255, 255));
      const min = Math.max(f.min ?? 0, f.required ? 1 : 0);
      if (min) s = s.min(min);
      return nonBlank(f, s.transform(stripControl));
    }
    case 'longtext': {
      let s = z.string().max(Math.min(f.max ?? 100_000, 1_000_000));
      const min = Math.max(f.min ?? 0, f.required ? 1 : 0);
      if (min) s = s.min(min);
      return nonBlank(f, s.transform(stripControl));
    }
    // Rich text diperiksa SETELAH disanitasi: '<script>x</script>' menjadi kosong dan ditolak bila field wajib.
    case 'richtext': return nonBlank(f, z.string().max(Math.min(f.max ?? 200_000, 1_000_000)).transform(cleanRichText));
    case 'integer': return z.number().int().min(Math.max(f.min ?? INT_MIN, INT_MIN)).max(Math.min(f.max ?? INT_MAX, INT_MAX));
    case 'float': return z.number().finite().min(f.min ?? -1e15).max(f.max ?? 1e15);
    case 'boolean': return z.boolean();
    case 'datetime': return z.string().max(40).datetime({ offset: true }).transform((v) => new Date(v).toISOString());
    case 'email': return z.string().max(254).email().transform((s) => s.toLowerCase());
    case 'slug': return z.string().min(1).max(160).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, digits and hyphens');
    case 'enum': return z.enum(f.values as [string, ...string[]]);
    case 'json': {
      const j = z.unknown().refine((v) => jsonOk(v) && JSON.stringify(v ?? null).length <= 200_000, 'Invalid or too large JSON');
      return f.required ? j.refine((v) => v !== undefined && v !== null, 'Required') : j;
    }
    case 'media': case 'relation': return z.string().uuid();
  }
}

export function parseFieldValue(field: FieldDef, value: unknown): unknown {
  return fieldZod(field).parse(value);
}

export function dataSchema(ct: ContentType, partial: boolean) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of ct.fields) {
    const base = fieldZod(f);
    shape[f.name] = f.required ? (partial ? base.optional() : base) : base.nullish();
  }
  // .strict(): field yang tidak ada di skema ditolak (bukan diabaikan) -> tidak ada mass-assignment.
  return z.object(shape).strict();
}


export const STATUS = z.enum(['draft', 'published']);
export type EntryStatus = z.infer<typeof STATUS>;

/** Bentuk body POST: { data, status? } */
export const createEnvelope = (ct: ContentType) => z.object({ data: dataSchema(ct, false), status: STATUS.optional() }).strict();
/** Bentuk body PATCH: { data? (parsial), status? } */
export const updateEnvelope = (ct: ContentType) => z.object({ data: dataSchema(ct, true).optional(), status: STATUS.optional() }).strict();
