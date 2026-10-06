import { z } from 'zod';

export const uuidParams = z.object({ id: z.string().uuid() });
export const roleIdParams = z.object({ id: z.string().regex(/^[a-z0-9-]{1,36}$/) });
export const apiIdParams = z.object({ apiId: z.string().regex(/^[a-z][a-z0-9_]{0,43}$/) });
export const contentParams = z.object({ apiId: z.string().regex(/^[a-z][a-z0-9_]{0,43}$/), id: z.string().max(40).optional() });
export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
}).strict();
