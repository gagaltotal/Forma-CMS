import type { FastifyInstance } from 'fastify';
import type { Controllers } from '../controllers/index.js';
import { requireUser } from '../middleware/authorize.js';

export function tokenRoutes(app: FastifyInstance, c: Controllers): void {
  const guard = { preHandler: [requireUser('tokens:manage')] };
  app.get('/api/admin/tokens', guard, c.tokens.list);
  app.post('/api/admin/tokens', guard, c.tokens.create);
  app.delete('/api/admin/tokens/:id', guard, c.tokens.revoke);
}
