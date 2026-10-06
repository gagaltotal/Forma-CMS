import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AppContext } from '../core/container.js';
import type { Principal } from '../security/permissions.js';
import type { SessionInfo } from '../types/fastify.js';
import { authenticate } from './authenticate.js';
import { csrfProtection } from './csrf.js';

/** Hanya API & GraphQL yang melewati pipeline autentikasi (aset statis admin dan /media/file tidak). */
const inApiScope = (req: FastifyRequest) => {
  const path = req.url.split('?')[0]!;
  return path.startsWith('/api/') || path === '/graphql';
};

/**
 * Urutan pipeline request (onRequest): [rate-limit plugin] -> no-store -> authenticate -> CSRF.
 * Otorisasi per-endpoint dipasang di route sebagai preHandler (lihat middleware/authorize.ts).
 */
export function registerRequestPipeline(app: FastifyInstance, ctx: AppContext): void {
  app.decorate('ctx', ctx);
  app.decorateRequest('principal', null as unknown as Principal);
  app.decorateRequest('session', null as unknown as SessionInfo | null);
  app.decorateRequest('viaBearer', false);

  const auth = authenticate(ctx);
  const csrf = csrfProtection(ctx);

  app.addHook('onRequest', async (req, reply) => {
    if (!inApiScope(req)) return;
    reply.header('Cache-Control', 'no-store');
    await auth(req);
    await csrf(req);
  });
}
