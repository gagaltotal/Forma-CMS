import { toast } from './toast.js';

/* Pemformat tampilan & utilitas kecil. */
export const fmtSize = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);

export const fmtDate = (v: number | string | null | undefined) =>
  v == null ? '—' : new Date(v).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number) {
  let t: number | undefined;
  return (...a: A) => { clearTimeout(t); t = window.setTimeout(() => fn(...a), ms); };
}

export async function copyText(text: string): Promise<void> {
  try { await navigator.clipboard.writeText(text); toast('Copied'); } catch { toast('Copy failed. Select the text and copy it manually.', 'err'); }
}

export const errMsg = (e: unknown): string => (e instanceof Error ? e.message : 'Something went wrong');
