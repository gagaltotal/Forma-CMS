import { z } from 'zod';

export const emailField = z.string().max(254).email().transform((s) => s.toLowerCase());

export const loginBody = z.object({
  email: emailField,
  password: z.string().min(1).max(128),
  totpCode: z.string().min(6).max(20).optional(),
}).strict();
export const changePasswordBody = z.object({ currentPassword: z.string().min(1).max(128), newPassword: z.string().max(128) }).strict();
