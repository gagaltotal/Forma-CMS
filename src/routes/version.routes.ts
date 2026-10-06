import type { FastifyInstance } from 'fastify';
import type { Controllers } from '../controllers/index.js';
import { authenticate } from '../middleware/authenticate.js';
import type { AppContext } from '../core/container.js';

export function versionRoutes(app: FastifyInstance, c: Controllers, ctx: AppContext): void {
  const auth = authenticate(ctx);

  app.get('/api/content/:type/:id/versions', { preHandler: [auth] }, c.versions.list);
  app.get('/api/content/:type/:id/versions/:version', { preHandler: [auth] }, c.versions.get);
  app.get('/api/content/:type/:id/versions/:version/data', { preHandler: [auth] }, c.versions.getData);
}
