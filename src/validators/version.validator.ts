import { z } from 'zod';

export const versionParams = z.object({
  type: z.string().regex(/^[a-z][a-z0-9_]{0,43}$/),
  id: z.string().max(40),
  version: z.coerce.number().int().min(1),
});

export const versionListParams = z.object({
  type: z.string().regex(/^[a-z][a-z0-9_]{0,43}$/),
  id: z.string().max(40),
});

export const versionListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
}).strict();
