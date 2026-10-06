import type { FastifyInstance } from 'fastify';
import type { Controllers } from '../controllers/index.js';
import { requireUser } from '../middleware/authorize.js';

export function userRoutes(app: FastifyInstance, c: Controllers): void {
  const guard = { preHandler: [requireUser('users:manage')] };
  app.get('/api/admin/users', guard, c.users.list);
  app.post('/api/admin/users', guard, c.users.create);
  app.put('/api/admin/users/:id', guard, c.users.update);
  app.delete('/api/admin/users/:id', guard, c.users.remove);
}
