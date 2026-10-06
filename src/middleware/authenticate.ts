import type { FastifyRequest } from 'fastify';
import type { AppContext } from '../core/container.js';

/**
 * Menentukan identitas request -> `req.principal`:
 *   1) Bearer API token  (kredensial eksplisit; cookie diabaikan sepenuhnya)
 *   2) Cookie sesi       (server-side, token di-hash, terikat User-Agent)
 *   3) Publik            (izin dari role "public")
 * Error 401 hanya dilempar untuk Bearer yang tidak valid; cookie rusak = diperlakukan sebagai publik.
 */
export function authenticate(ctx: AppContext) {
  const { cfg, services } = ctx;
  return async (req: FastifyRequest): Promise<void> => {
    const ip = req.ip;
    req.session = null;
    req.viaBearer = false;

    const authz = req.headers.authorization;
    if (authz !== undefined) {
      const t = await services.tokens.authenticate(authz);
      req.principal = { kind: 'token', id: t.id, perms: t.perms, ip };
      req.viaBearer = true;
      return;
    }

    const raw = req.cookies?.[cfg.cookieName];
    if (raw) {
      const r = await services.sessions.resolve(raw, req.headers['user-agent'] ?? '', ip);
      if (r) {
        req.principal = { kind: 'user', id: r.user.id, perms: await services.roles.permissionsOf(r.user.role_id), ip };
        req.session = r.session;
        return;
      }
    }
    req.principal = { kind: 'public', id: null, perms: await services.roles.permissionsOf('public'), ip };
  };
}
