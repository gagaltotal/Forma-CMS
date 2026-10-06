import { z } from 'zod';
import { emailField } from './auth.validator.js';

export const passwordResetRequestBody = z.object({ email: emailField }).strict();
export const passwordResetResetBody = z.object({
  token: z.string().min(1).max(256),
  newPassword: z.string().min(8).max(128),
}).strict();
