import type { FastifyInstance } from 'fastify';
import type { Controllers } from '../controllers/index.js';
import { requireUser, requireUserAny } from '../middleware/authorize.js';

export function roleRoutes(app: FastifyInstance, c: Controllers): void {
  const guard = { preHandler: [requireUser('roles:manage')] };
  // Daftar role dibutuhkan oleh pengelola user, role, maupun token (untuk memilih role).
  app.get('/api/admin/roles', { preHandler: [requireUserAny(['users:manage', 'roles:manage', 'tokens:manage'])] }, c.roles.list);
  app.post('/api/admin/roles', guard, c.roles.create);
  app.put('/api/admin/roles/:id', guard, c.roles.update);
  app.delete('/api/admin/roles/:id', guard, c.roles.remove);
}
