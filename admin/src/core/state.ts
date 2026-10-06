import type { ContentType, Me } from './types.js';

/* State sesi di memori + helper izin (hanya untuk UI; server tetap sumber kebenaran). */
export const state = { me: null as Me | null, csrf: '', types: [] as ContentType[] };

export function can(perm: string): boolean {
  const p = new Set(state.me?.permissions ?? []);
  if (p.has('*') || p.has(perm)) return true;
  const m = /^content:[a-z][a-z0-9_]*:(\w+)$/.exec(perm);
  return !!m && p.has(`content:*:${m[1]}`);
}

export const canAnyOn = (apiId: string) => ['read', 'drafts', 'create', 'update', 'delete', 'publish'].some((a) => can(`content:${apiId}:${a}`));

export const typeByApi = (apiId: string) => state.types.find((t) => t.apiId === apiId);

export function entryLabel(ct: ContentType | undefined, e: Record<string, any>): string {
  const f = ct?.fields.find((x) => ['text', 'slug', 'email'].includes(x.type));
  const v = f ? e[f.name] : null;
  return v ? String(v) : `#${String(e.id).slice(0, 8)}`;
}
