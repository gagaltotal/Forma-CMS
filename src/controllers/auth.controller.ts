import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppContext } from '../core/container.js';
import { badRequest } from '../utils/errors.js';
import { clearSessionCookie, setSessionCookie } from '../utils/cookies.js';
import { requestMeta } from '../utils/request.js';
import { changePasswordBody, loginBody } from '../validators/auth.validator.js';

export class AuthController {
  constructor(private ctx: AppContext) {}
  private get auth() { return this.ctx.services.auth; }

  login = async (req: FastifyRequest, reply: FastifyReply) => {
    const body = loginBody.safeParse(req.body);
    if (!body.success) throw badRequest('Email and password are required');
    const previous = req.cookies?.[this.ctx.cfg.cookieName];
    const r = await this.auth.login(body.data.email, body.data.password, requestMeta(req), previous, body.data.totpCode);
    setSessionCookie(this.ctx.cfg, reply, r.token);
    return { user: r.user, csrfToken: r.csrf };
  };

  me = async (req: FastifyRequest) => ({ user: await this.auth.me(req.session!.userId), csrfToken: req.session!.csrf });

  logout = async (req: FastifyRequest, reply: FastifyReply) => {
    await this.auth.logout(req.session, req.ip);
    clearSessionCookie(this.ctx.cfg, reply);
    return { ok: true };
  };

  changePassword = async (req: FastifyRequest, reply: FastifyReply) => {
    const body = changePasswordBody.safeParse(req.body);
    if (!body.success) throw badRequest('Current and new password are required');
    const r = await this.auth.changePassword(req.session!.userId, body.data.currentPassword, body.data.newPassword, requestMeta(req));
    setSessionCookie(this.ctx.cfg, reply, r.token);
    return { ok: true, csrfToken: r.csrf };
  };
}
