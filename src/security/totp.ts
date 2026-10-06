import { createHmac, randomBytes } from 'node:crypto';

/** Generate TOTP secret (base32 encoded) */
export function generateTotpSecret(): string {
  const buffer = randomBytes(20);
  return base32Encode(buffer);
}

/** Verify TOTP code dengan window tolerance */
export function verifyTotp(secret: string, token: string, window = 1): boolean {
  const decoded = base32Decode(secret);
  const now = Math.floor(Date.now() / 1000);
  const timeStep = 30;

  for (let i = -window; i <= window; i++) {
    const time = Math.floor(now / timeStep) + i;
    const code = generateTotpCode(decoded, time);
    if (code === token) return true;
  }
  return false;
}

/** Generate TOTP code untuk waktu tertentu */
function generateTotpCode(secret: Buffer, timeCounter: number): string {
  const timeBuffer = Buffer.alloc(8);
  timeBuffer.writeBigInt64BE(BigInt(timeCounter));

  const hmac = createHmac('sha1', secret);
  hmac.update(timeBuffer);
  const hash = hmac.digest();

  const offset = hash[hash.length - 1] & 0xf;
  const code =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff);

  return (code % 1000000).toString().padStart(6, '0');
}

/** Generate TOTP provisioning URI untuk QR code */
export function generateTotpUri(secret: string, email: string, issuer = 'Forma CMS'): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&digits=6&period=30`;
}

/** Generate backup codes (10 codes, 8 karakter) */
export function generateBackupCodes(count = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const code = randomBytes(4).toString('hex').toUpperCase();
    codes.push(code);
  }
  return codes;
}

/** Base32 encoding (RFC 4648) */
function base32Encode(buffer: Buffer): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += alphabet[(value << (5 - bits)) & 31];
  }

  return output;
}

/** Base32 decoding */
function base32Decode(str: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const cleanStr = str.toUpperCase().replace(/[^A-Z2-7]/g, '');
  const output: number[] = [];
  let bits = 0;
  let value = 0;

  for (let i = 0; i < cleanStr.length; i++) {
    const idx = alphabet.indexOf(cleanStr[i]);
    if (idx === -1) continue;

    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(output);
}
