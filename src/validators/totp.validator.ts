import { z } from 'zod';

export const totpCodeBody = z.object({ code: z.string().min(6).max(20) }).strict();
export const totpPasswordBody = z.object({ password: z.string().min(1).max(128) }).strict();
