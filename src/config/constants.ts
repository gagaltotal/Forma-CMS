/** Konstanta keamanan & batas. Satu tempat untuk meninjau seluruh angka "ajaib" aplikasi. */

export const BODY_LIMIT_BYTES = 1_048_576; // JSON maks 1 MB (upload memakai limit multipart terpisah)

export const AUTH = {
  MAX_FAILED_LOGINS: 5,
  BASE_LOCK_MS: 15 * 60_000, // 5 gagal -> 15 mnt, lalu berlipat ganda
  MAX_LOCK_MS: 24 * 3_600_000,
  MAX_SESSIONS_PER_USER: 10,
  SESSION_TOUCH_INTERVAL_MS: 60_000,
  LOGIN_WINDOW: '15 minutes',
  PASSWORD_CHANGE_MAX: 5,
} as const;

export const RATE = {
  UPLOAD_PER_MINUTE: 30,
  GRAPHQL_PER_MINUTE: 120,
} as const;

export const GRAPHQL = {
  MAX_DEPTH: 6,
  MAX_NODES: 150,
  MAX_QUERY_LENGTH: 10_000,
  MAX_PARSER_TOKENS: 3000,
  MAX_VISITS: 3000, // anggaran kunjungan: mencegah "fragment bomb"
} as const;

export const PAGINATION = { DEFAULT: 25, MAX: 100 } as const;

/** Role bawaan yang di-seed oleh migrasi. Role "admin" tidak bisa diubah; "public" hanya boleh izin baca. */
export const SYSTEM_ROLES = {
  admin: { name: 'Administrator', description: 'Akses penuh ke seluruh sistem', permissions: ['*'] as string[] },
  editor: {
    name: 'Editor',
    description: 'Mengelola seluruh konten dan media',
    permissions: [
      'content:*:read', 'content:*:drafts', 'content:*:create', 'content:*:update',
      'content:*:delete', 'content:*:publish', 'media:read', 'media:upload', 'media:delete',
    ] as string[],
  },
  public: { name: 'Public', description: 'Pengunjung tanpa login / frontend publik', permissions: [] as string[] },
} as const;
