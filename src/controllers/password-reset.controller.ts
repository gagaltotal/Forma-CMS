import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppContext } from '../core/container.js';
import { HttpError } from '../utils/errors.js';
import { parseWith } from '../validators/parse.js';
import { passwordResetRequestBody, passwordResetResetBody } from '../validators/password-reset.validator.js';

export class PasswordResetController {
  constructor(private readonly ctx: AppContext) {}

  private get passwordReset() { return this.ctx.services.passwordReset; }

  /** POST /api/password-reset/request - Minta tautan reset password */
  request = async (req: FastifyRequest, reply: FastifyReply) => {
    const { email } = parseWith(passwordResetRequestBody, req.body);
    await this.passwordReset.requestReset(email);
    // Selalu sukses untuk mencegah email enumeration
    reply.send({ success: true, message: 'If the email exists, a reset link has been sent' });
  };

  /** POST /api/password-reset/reset - Reset password dengan token */
  reset = async (req: FastifyRequest, reply: FastifyReply) => {
    const { token, newPassword } = parseWith(passwordResetResetBody, req.body);
    const result = await this.passwordReset.verifyAndReset(token, newPassword);
    if (!result.success) throw new HttpError(400, 'bad_request', result.error || 'Gagal reset password');
    reply.send({ success: true });
  };
}
