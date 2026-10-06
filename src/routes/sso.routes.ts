import type { FastifyInstance } from 'fastify';
import type { Controllers } from '../controllers/index.js';
import type { AppContext } from '../core/container.js';
import { limits } from '../middleware/rate-limit.js';

/** Rute SSO (OIDC). GET /start memulai alur; GET /callback menerima respons penyedia. */
export function ssoRoutes(app: FastifyInstance, c: Controllers, ctx: AppContext): void {
  app.get('/api/auth/sso/info', c.sso.info);
  app.get('/api/auth/sso/start', { config: limits.sso(ctx.cfg) }, c.sso.start);
  app.get('/api/auth/sso/callback', { config: limits.sso(ctx.cfg) }, c.sso.callback);
}