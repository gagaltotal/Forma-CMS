import { z } from 'zod';

export const createTokenBody = z.object({
  name: z.string().trim().min(1).max(100),
  roleId: z.string().regex(/^[a-z0-9-]{1,36}$/),
  expiresInDays: z.number().int().min(1).max(365).nullable().optional(),
}).strict();
