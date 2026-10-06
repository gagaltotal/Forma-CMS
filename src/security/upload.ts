import path from 'node:path';

export interface FileKind { mime: string; ext: string; inline: boolean }

/** Tipe file ditentukan dari ISI (magic bytes), BUKAN dari nama/ekstensi/Content-Type kiriman klien. SVG/HTML/JS sengaja tidak diizinkan. */
export function sniff(b: Buffer): FileKind | null {
  const head = (n: number) => b.subarray(0, n).toString('latin1');
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png', inline: true };
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg', inline: true };
  if (b.length >= 6 && (head(6) === 'GIF87a' || head(6) === 'GIF89a')) return { mime: 'image/gif', ext: 'gif', inline: true };
  if (b.length >= 12 && head(4) === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return { mime: 'image/webp', ext: 'webp', inline: true };
  if (b.length >= 5 && head(5) === '%PDF-') return { mime: 'application/pdf', ext: 'pdf', inline: false };
  return null;
}

const STORED_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|gif|webp|pdf)$/;

/** Menggabungkan root + nama file terverifikasi; menolak apa pun yang keluar dari root (anti path traversal / LFI). */
export function safeJoin(root: string, name: string): string {
  if (!STORED_RE.test(name)) throw new Error('invalid stored name');
  const full = path.resolve(root, name);
  if (path.dirname(full) !== root) throw new Error('path escape');
  return full;
}
