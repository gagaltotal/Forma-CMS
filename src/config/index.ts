import 'dotenv/config';
import { z } from 'zod';

const bool = (d: 'true' | 'false') =>
  z.enum(['true', 'false']).default(d).transform((v) => v === 'true');

/** Anggap string kosong (mis. `SSO_ISSUER=` di .env/Compose) sebagai "tidak diset". */
const blankToUndef = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const optionalUrl = () =>
  z.preprocess(blankToUndef, z.string().url({ message: 'Invalid url' }).optional());
const optionalStr = () => z.preprocess(blankToUndef, z.string().optional());

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  /** URL publik (dipakai untuk cookie Secure, cek Origin/CSRF dan URL media). */
  PUBLIC_URL: z.string().url().default('http://127.0.0.1:3000'),

  DB_CLIENT: z.enum(['sqlite', 'postgres', 'mysql']).default('sqlite'),
  DATABASE_URL: z.string().optional(),
  SQLITE_PATH: z.string().default('./data/forma.db'),

  /** Rahasia untuk rantai HMAC audit log. Minimal 32 karakter acak. */
  APP_SECRET: z.string().min(32, 'APP_SECRET minimal 32 karakter (contoh: openssl rand -hex 32)'),

  UPLOAD_DIR: z.string().default('./data/uploads'),
  MAX_UPLOAD_MB: z.coerce.number().min(1).max(200).default(10),

  /** Aktifkan HANYA jika berjalan di belakang reverse proxy tepercaya. */
  TRUST_PROXY: bool('false'),
  /** Daftar origin frontend yang boleh memanggil API (dipisah koma). Kosong = same-origin saja. */
  CORS_ORIGINS: z.string().default(''),

  SESSION_IDLE_MINUTES: z.coerce.number().min(1).default(60),
  SESSION_MAX_HOURS: z.coerce.number().min(1).default(12),

  GRAPHQL_INTROSPECTION: bool('false'),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().min(10).default(300),
  /** IP tepercaya (mis. server SSR frontend) yang dikecualikan dari rate limit UMUM. Login/ganti password tetap dibatasi. */
  RATE_LIMIT_ALLOWLIST: z.string().default(''),
  LOGIN_MAX_PER_15MIN: z.coerce.number().min(3).default(10),

  /**
   * SSO berbasis OIDC/OAuth2 (mis. Google, Azure AD, Keycloak, Okta).
   * Pengguna WAJIB sudah terdaftar di Forma CMS — SSO tidak membuat akun baru otomatis.
   * Tersedia untuk SEMUA role; hak akses tetap mengikuti role pengguna di CMS.
   */
  SSO_ENABLED: bool('false'),
  SSO_PROVIDER_NAME: z.string().default('SSO'),
  SSO_ISSUER: optionalUrl(),
  SSO_CLIENT_ID: optionalStr(),
  SSO_CLIENT_SECRET: optionalStr(),
  /** Default: `${PUBLIC_URL}/api/auth/sso/callback` */
  SSO_REDIRECT_URI: optionalUrl(),
  SSO_SCOPES: z.string().default('openid email profile'),
  /** Berapa lama state OIDC (PKCE) berlaku, dalam menit. */
  SSO_STATE_TTL_MINUTES: z.coerce.number().min(1).max(60).default(10),
  /** Seed otomatis halaman `home` siap pakai saat boot pertama (tanpa data apa pun). */
  SEED_HOMEPAGE_ON_BOOT: bool('true'),
});

export type Config = z.infer<typeof schema> & {
  cookieSecure: boolean;
  cookieName: string;
  publicOrigin: string;
  corsOrigins: string[];
  rateLimitAllowlist: string[];
  /** true hanya jika semua env SSO wajib terisi. */
  ssoEnabled: boolean;
  ssoRedirectUri: string;
  ssoScopes: string[];
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Konfigurasi tidak valid:\n${msg}`);
  }
  const c = parsed.data;
  if (c.DB_CLIENT !== 'sqlite' && !c.DATABASE_URL) {
    throw new Error('DATABASE_URL wajib diisi untuk PostgreSQL/MySQL');
  }
  if (c.NODE_ENV === 'production') {
    if (!c.PUBLIC_URL.startsWith('https://')) {
      throw new Error('Di production PUBLIC_URL harus https:// (cookie sesi memakai flag Secure)');
    }
    if (/change[-_]?me|example|secret|password/i.test(c.APP_SECRET)) {
      throw new Error('APP_SECRET terlihat seperti placeholder. Buat yang acak: openssl rand -hex 32');
    }
  }
  const publicOrigin = new URL(c.PUBLIC_URL).origin;
  const cookieSecure = publicOrigin.startsWith('https://');
  const ssoComplete = !!(c.SSO_ISSUER && c.SSO_CLIENT_ID && c.SSO_CLIENT_SECRET);
  if (c.SSO_ENABLED && !ssoComplete) {
    throw new Error('SSO_ENABLED=true memerlukan SSO_ISSUER, SSO_CLIENT_ID, dan SSO_CLIENT_SECRET');
  }
  return {
    ...c,
    publicOrigin,
    cookieSecure,
    // Prefix __Host- mengikat cookie ke host persis, wajib Secure + Path=/ (mencegah cookie tossing).
    cookieName: cookieSecure ? '__Host-forma_sid' : 'forma_sid',
    corsOrigins: c.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
    rateLimitAllowlist: c.RATE_LIMIT_ALLOWLIST.split(',').map((s) => s.trim()).filter(Boolean),
    // Aktif hanya bila diminta DAN konfigurasi lengkap (aman untuk semua role, tanpa auto-provision).
    ssoEnabled: c.SSO_ENABLED && ssoComplete,
    ssoRedirectUri: c.SSO_REDIRECT_URI ?? `${publicOrigin}/api/auth/sso/callback`,
    ssoScopes: c.SSO_SCOPES.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean),
  };
}
