import type { FastifyInstance } from 'fastify';
import type { Controllers } from '../controllers/index.js';
import { requirePermission } from '../middleware/authorize.js';
import { limits } from '../middleware/rate-limit.js';

export function mediaRoutes(app: FastifyInstance, c: Controllers): void {
  app.get('/api/media', { preHandler: [requirePermission('media:read')] }, c.media.list);
  app.post('/api/media', { preHandler: [requirePermission('media:upload')], config: limits.upload() }, c.media.upload);
  app.patch('/api/media/:id', { preHandler: [requirePermission('media:upload')] }, c.media.update);
  app.delete('/api/media/:id', { preHandler: [requirePermission('media:delete')] }, c.media.remove);
  // Publik (di luar /api): tidak melewati pipeline autentikasi.
  app.get('/media/file/:id', c.media.serve);
}
