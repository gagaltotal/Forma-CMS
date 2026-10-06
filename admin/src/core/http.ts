import { state } from './state.js';
import type { ContentType, MediaItem } from './types.js';

/* Klien HTTP: cookie sesi + header CSRF pada request mutasi. */
export class ApiError extends Error {
  constructor(public status: number, message: string, public issues: { path: string; message: string }[] = []) { super(message); }
}

export async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  if (method !== 'GET') headers['x-csrf-token'] = state.csrf;
  const res = await fetch(path, { method, headers, body: payload, credentials: 'same-origin', cache: 'no-store' });
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/api/auth/login')) window.dispatchEvent(new Event('forma:unauth'));
    throw new ApiError(res.status, json?.error?.message ?? res.statusText, json?.error?.issues ?? []);
  }
  return json as T;
}

export async function loadTypes(): Promise<void> {
  state.types = (await api<{ data: ContentType[] }>('GET', '/api/admin/content-types')).data;
}

export async function uploadFile(file: File): Promise<MediaItem> {
  const fd = new FormData();
  fd.append('file', file);
  return (await api<{ data: MediaItem }>('POST', '/api/media', fd)).data;
}
