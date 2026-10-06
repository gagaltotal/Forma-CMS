import { z } from 'zod';
import { emailField } from './auth.validator.js';

const roleId = z.string().regex(/^[a-z0-9-]{1,36}$/);

export const createUserBody = z.object({
  email: emailField, name: z.string().trim().min(1).max(100), password: z.string().max(128), roleId,
}).strict();

export const updateUserBody = z.object({
  name: z.string().trim().min(1).max(100).optional(), roleId: roleId.optional(),
  active: z.boolean().optional(), password: z.string().max(128).optional(), unlock: z.boolean().optional(),
}).strict();
