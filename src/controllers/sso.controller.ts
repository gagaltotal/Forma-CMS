import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppContext } from '../core/container.js';
import { badRequest } from '../utils/errors.js';
import { clearSessionCookie, setSessionCookie } from '../utils/cookies.js';
import { requestMeta } from '../utils/request.js';
import { ssoCallbackQuery, ssoStartQuery } from '../validators/sso.validator.js';

const html = (reply: FastifyReply, body: string) =>
  reply.type('text/html; charset=utf-8').send(`<!doctype html><html><head><meta charset="utf-8"><title>SSO</title></head><body><script>${body}</script></body></html>`);

/** Endpoint SSO (OIDC). Tersedia untuk semua role; akun tetap harus terdaftar di CMS. */
export class SsoController {
  constructor(private ctx: AppContext) {}
  private get sso() { return this.ctx.services.sso; }

  /** Ketersediaan provider (tanpa rahasia) untuk memutuskan apakah tombol SSO ditampilkan. */
  info = async () => this.sso.info();

  /** Mulai alur: redirect 302 ke penyedia identitas. */
  start = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!this.sso.enabled) throw badRequest('SSO is not enabled');
    const q = ssoStartQuery.safeParse(req.query ?? {});
    const redirect = q.success ? q.data.redirect : undefined;
    const { url } = await this.sso.start(requestMeta(req), redirect);
    return reply.redirect(url);
  };

  /**
   * Callback dari penyedia. Selalu kembali ke UI login membawa status,
   * dan memasang cookie sesi bila pengguna terdaftar & tervalidasi.
   */
  callback = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!this.sso.enabled) throw badRequest('SSO is not enabled');
    const q = ssoCallbackQuery.safeParse(req.query ?? {});
    const p = q.success ? q.data : {};
    try {
      const r = await this.sso.complete(requestMeta(req), {
        code: p.code, state: p.state, error: p.error, errorDescription: p.error_description,
      });
      setSessionCookie(this.ctx.cfg, reply, r.token);
      const target = `${r.redirectTo}${r.redirectTo.includes('?') ? '&' : '?'}sso=1`;
      return html(reply, `window.location.replace(${JSON.stringify(target)});`);
    } catch (err) {
      // Jangan bocorkan detail internal ke pengguna; cukup kode alasan.
      clearSessionCookie(this.ctx.cfg, reply);
      await this.ctx.services.audit.log('auth.sso_failed', null, null, req.ip, { reason: err instanceof Error ? err.message : 'unknown' });
      const target = `/admin/index.html?sso_error=${encodeURIComponent(err instanceof Error ? err.message : 'SSO failed')}`;
      return html(reply, `window.location.replace(${JSON.stringify(target)});`);
    }
  };
}