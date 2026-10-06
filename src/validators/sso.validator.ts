import { z } from 'zod';

/** Awal alur: OIDC authorize. Boleh membawa tujuan kembali (hanya path internal yang diterima). */
export const ssoStartQuery = z.object({
  redirect: z.string().max(300).optional(),
}).strict();

/** Callback dari penyedia OIDC. */
export const ssoCallbackQuery = z.object({
  code: z.string().min(1).max(4096).optional(),
  state: z.string().min(1).max(128).optional(),
  error: z.string().max(200).optional(),
  error_description: z.string().max(500).optional(),
}).strict();