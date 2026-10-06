import crypto from 'node:crypto';

export const sha256 = (s: string): string => crypto.createHash('sha256').update(s).digest('hex');
export const randomToken = (bytes = 32): string => crypto.randomBytes(bytes).toString('base64url');
export const uuid = (): string => crypto.randomUUID();

/** Perbandingan waktu-konstan (membandingkan hash agar panjang input tidak bocor). */
export function safeEqual(a: string, b: string): boolean {
  return crypto.timingSafeEqual(crypto.createHash('sha256').update(a).digest(), crypto.createHash('sha256').update(b).digest());
}
