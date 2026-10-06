import { z } from 'zod';

export const mediaListQuery = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
  q: z.string().max(100).optional(),
}).strict();

export const mediaPatchBody = z.object({
  alt: z.string().max(300).optional(),
  name: z.string().trim().min(1).max(120).optional(),
}).strict();
