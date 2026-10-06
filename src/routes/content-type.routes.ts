import type { FastifyInstance } from 'fastify';
import type { Controllers } from '../controllers/index.js';
import { requireUser } from '../middleware/authorize.js';

export function contentTypeRoutes(app: FastifyInstance, c: Controllers): void {
  const manage = { preHandler: [requireUser('schema:manage')] };
  app.get('/api/admin/content-types', { preHandler: [requireUser()] }, c.contentTypes.list);
  app.post('/api/admin/content-types', manage, c.contentTypes.create);
  app.put('/api/admin/content-types/:apiId', manage, c.contentTypes.update);
  app.delete('/api/admin/content-types/:apiId', manage, c.contentTypes.remove);
}
