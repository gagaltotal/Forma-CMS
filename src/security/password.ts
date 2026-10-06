import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt) as (
  pw: crypto.BinaryLike, salt: crypto.BinaryLike, keylen: number, opts: crypto.ScryptOptions,
) => Promise<Buffer>;

// scrypt (memory-hard) sesuai rekomendasi OWASP: N=2^15, r=8, p=1  (~32 MB / hash)
const N = 2 ** 15, R = 8, P = 1, KEYLEN = 64;
const MAXMEM = 128 * 1024 * 1024;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const dk = await scrypt(password.normalize('NFKC'), salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${dk.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const n = Number(parts[1]), r = Number(parts[2]), p = Number(parts[3]);
  // Batasi parameter agar hash yang rusak tidak bisa dipakai untuk DoS memori.
  if (!(n >= 2 ** 12 && n <= 2 ** 17) || !(r >= 1 && r <= 16) || !(p >= 1 && p <= 4)) return false;
  const salt = Buffer.from(parts[4]!, 'base64');
  const expected = Buffer.from(parts[5]!, 'base64');
  const dk = await scrypt(password.normalize('NFKC'), salt, expected.length, { N: n, r, p, maxmem: MAXMEM });
  return dk.length === expected.length && crypto.timingSafeEqual(dk, expected);
}

let dummy: Promise<string> | null = null;
/** Hash palsu: dipakai agar waktu respons login sama baik email ada maupun tidak (anti user-enumeration). */
export function dummyHash(): Promise<string> {
  return (dummy ??= hashPassword(crypto.randomBytes(16).toString('hex')));
}

const COMMON = new Set([
  'password1234', '123456789012', 'qwertyuiop12', 'administrator', 'welcome12345', 'letmein12345',
  'iloveyou1234', 'password12345', 'changeme1234', 'admin1234567', '1234567890123',
]);

/** Kebijakan NIST 800-63B: panjang > kompleksitas; tolak yang umum/berisi email. */
export function checkPasswordStrength(pw: string, email?: string): string | null {
  if (pw.length < 12) return 'Password must be at least 12 characters';
  if (pw.length > 128) return 'Password must be at most 128 characters';
  if (/^(.)\1+$/.test(pw)) return 'Password is too repetitive';
  if (COMMON.has(pw.toLowerCase())) return 'Password is too common';
  const local = email?.split('@')[0]?.toLowerCase();
  if (local && local.length >= 4 && pw.toLowerCase().includes(local)) return 'Password must not contain your email name';
  if (new Set(pw).size < 5) return 'Password needs more variety of characters';
  return null;
}
