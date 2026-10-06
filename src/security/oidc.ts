import crypto from 'node:crypto';

/** SHA-256 -> base64url: dipakai untuk document id (RFC 7638) dan verifikasi PKCE (S256). */
const sha256b64url = (input: string): string => crypto.createHash('sha256').update(input).digest('base64url');

/** Base64url decode yang longgar (menerima '+' '/' tanpa padding) -> Buffer. */
export const b64urlToBuffer = (value: string): Buffer =>
  Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

/**
 * Parsing bagian payload JWT/JWKS TANPA verifikasi tanda tangan.
 * Verifikasi kriptografis dilakukan oleh `SsoService`; helper ini tidak boleh dipakai untuk mempercayai data.
 */
export const decodeJwtPayload = (jwt: string): Record<string, unknown> => {
  const parts = jwt.split('.');
  if (parts.length !== 3) throw new Error('Token bukan JWT yang valid');
  return JSON.parse(b64urlToBuffer(parts[1]!).toString('utf8')) as Record<string, unknown>;
};

const asStrings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : typeof v === 'string' ? [v] : [];

/**
 * Verifikasi tanda tangan JWT (RS256) terhadap JWKS milik penyedia OIDC,
 * plus evaluasi klaim iss/aud/exp/nonce. Murni kriptografi — tanpa I/O.
 */
export const verifyJwt = (opts: {
  token: string;
  jwks: { keys?: Array<Record<string, unknown>> };
  issuer: string;
  audience: string;
  nonce?: string;
  clockSkewSec?: number;
}): Record<string, unknown> => {
  const parts = opts.token.split('.');
  if (parts.length !== 3) throw new Error('Token bukan JWT yang valid');
  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];
  const header = JSON.parse(b64urlToBuffer(headerB64).toString('utf8')) as Record<string, unknown>;
  const payload = JSON.parse(b64urlToBuffer(payloadB64).toString('utf8')) as Record<string, unknown>;

  const keys = opts.jwks.keys ?? [];
  let rsaKey: crypto.KeyObject | undefined;
  if (header.alg === 'RS256' && typeof header.kid === 'string') {
    const jwk = keys.find((k) => k.kid === header.kid && k.kty === 'RSA');
    if (jwk) rsaKey = crypto.createPublicKey({ key: jwk, format: 'jwk' } as unknown as crypto.PublicKeyInput);
  }
  if (!rsaKey) throw new Error('Kunci tanda tangan tidak dikenal');

  const ok = crypto.verify('RSA-SHA256', Buffer.from(`${headerB64}.${payloadB64}`), rsaKey, b64urlToBuffer(signatureB64));
  if (!ok) throw new Error('Tanda tangan token tidak valid');

  const now = Math.floor(Date.now() / 1000);
  const skew = opts.clockSkewSec ?? 60;
  if (typeof payload.exp === 'number' && payload.exp < now - skew) throw new Error('Token sudah kedaluwarsa');
  if (typeof payload.nbf === 'number' && payload.nbf > now + skew) throw new Error('Token belum berlaku');
  if (payload.aud !== undefined && !asStrings(payload.aud).includes(opts.audience)) throw new Error('Audience token tidak cocok');
  if (payload.iss !== opts.issuer) throw new Error('Issuer token tidak cocok');
  if (opts.nonce && payload.nonce !== opts.nonce) throw new Error('Nonce token tidak cocok');
  return payload;
};