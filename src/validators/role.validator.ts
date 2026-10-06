import { z } from 'zod';

export const roleBody = z.object({
  name: z.string().trim().min(2).max(64),
  description: z.string().max(255).default(''),
  permissions: z.array(z.string().max(80)).max(400),
}).strict();
export type RoleBody = z.infer<typeof roleBody>;
