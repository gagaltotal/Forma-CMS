import type { FastifyInstance } from 'fastify';
import type { Controllers } from '../controllers/index.js';

export function healthRoutes(app: FastifyInstance, c: Controllers): void {
  app.get('/api/health', c.health.check);
}
