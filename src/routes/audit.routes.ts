import type { FastifyInstance } from 'fastify';
import type { Controllers } from '../controllers/index.js';
import { requireUser } from '../middleware/authorize.js';

export function auditRoutes(app: FastifyInstance, c: Controllers): void {
  const guard = { preHandler: [requireUser('audit:read')] };
  app.get('/api/admin/audit', guard, c.audit.list);
  app.get('/api/admin/audit/verify', guard, c.audit.verify);
}
