/** Pembantu penamaan untuk tipe konten (tabel, GraphQL, bentuk jamak). */
export const tbl = (apiId: string): string => `ct_${apiId}`;
export const pascal = (s: string): string => s.split('_').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('');
export function pluralize(s: string): string {
  if (/(s|x|z|ch|sh)$/.test(s)) return `${s}es`;
  if (/[^aeiou]y$/.test(s)) return `${s.slice(0, -1)}ies`;
  return `${s}s`;
}
