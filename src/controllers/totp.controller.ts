import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppContext } from '../core/container.js';
import { HttpError, unauthorized } from '../utils/errors.js';
import { parseWith } from '../validators/parse.js';
import { totpCodeBody, totpPasswordBody } from '../validators/totp.validator.js';

export class TotpController {
  constructor(private readonly ctx: AppContext) {}

  private get totp() { return this.ctx.services.totp; }

  private userId(req: FastifyRequest): string {
    const id = req.principal?.kind === 'user' ? req.principal.id : null;
    if (!id) throw unauthorized();
    return id;
  }

  /** GET /api/totp/status - Status 2FA pengguna saat ini */
  status = async (req: FastifyRequest, reply: FastifyReply) => reply.send(await this.totp.status(this.userId(req)));

  /** POST /api/totp/setup - Mulai setup TOTP (secret, URI, backup codes) */
  setup = async (req: FastifyRequest, reply: FastifyReply) => {
    const result = await this.totp.setup(this.userId(req));
    reply.send({ secret: result.secret, qrCodeUri: result.qrCodeUri, backupCodes: result.backupCodes });
  };

  /** POST /api/totp/enable - Aktifkan TOTP setelah verifikasi kode */
  enable = async (req: FastifyRequest, reply: FastifyReply) => {
    const { code } = parseWith(totpCodeBody, req.body);
    const result = await this.totp.enable(this.userId(req), code);
    if (!result.success) throw new HttpError(400, 'bad_request', result.error || 'Gagal mengaktifkan TOTP');
    reply.send({ success: true });
  };

  /** POST /api/totp/disable - Nonaktifkan TOTP (butuh password) */
  disable = async (req: FastifyRequest, reply: FastifyReply) => {
    const { password } = parseWith(totpPasswordBody, req.body);
    const result = await this.totp.disable(this.userId(req), password);
    if (!result.success) throw new HttpError(400, 'bad_request', result.error || 'Gagal menonaktifkan TOTP');
    reply.send({ success: true });
  };

  /** POST /api/totp/regenerate-backup-codes - Regenerasi backup codes */
  regenerateBackupCodes = async (req: FastifyRequest, reply: FastifyReply) => {
    const { password } = parseWith(totpPasswordBody, req.body);
    const result = await this.totp.regenerateBackupCodes(this.userId(req), password);
    if (!result.success) throw new HttpError(400, 'bad_request', result.error || 'Gagal regenerasi backup codes');
    reply.send({ backupCodes: result.codes });
  };
}
