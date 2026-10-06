export interface Principal {
  kind: 'user' | 'token' | 'public';
  id: string | null;
  perms: ReadonlySet<string>;
  ip: string | null;
}

export const ACTIONS = ['read', 'drafts', 'create', 'update', 'delete', 'publish'] as const;
export const SYSTEM_PERMS = [
  'media:read', 'media:upload', 'media:delete',
  'schema:manage', 'users:manage', 'roles:manage', 'tokens:manage', 'audit:read',
] as const;

export const PERM_RE = new RegExp(
  `^(\\*|content:([a-z][a-z0-9_]{0,39}|\\*):(${ACTIONS.join('|')})|${SYSTEM_PERMS.join('|')})$`,
);
/** Role "public" hanya boleh membaca konten (tidak pernah menulis/mengelola). */
export const PUBLIC_PERM_RE = /^content:([a-z][a-z0-9_]{0,39}|\*):read$/;
/** API token hanya boleh membawa izin konten/media, tidak pernah izin administrasi. */
export const TOKEN_PERM_RE = new RegExp(`^(content:([a-z][a-z0-9_]{0,39}|\\*):(${ACTIONS.join('|')})|media:read|media:upload)$`);

export function can(perms: ReadonlySet<string>, perm: string): boolean {
  if (perms.has('*') || perms.has(perm)) return true;
  const m = /^content:[a-z][a-z0-9_]*:(\w+)$/.exec(perm);
  return !!m && perms.has(`content:*:${m[1]}`);
}

/** Anti privilege-escalation: apakah semua izin `child` juga dimiliki `parent`? */
export function isSubset(child: Iterable<string>, parent: ReadonlySet<string>): boolean {
  for (const p of child) if (!can(parent, p)) return false;
  return true;
}

export function hasAnyOnType(perms: ReadonlySet<string>, apiId: string): boolean {
  return ACTIONS.some((a) => can(perms, `content:${apiId}:${a}`));
}
