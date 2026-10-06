import type { FastifyInstance } from 'fastify';
import type { Controllers } from '../controllers/index.js';

/** Otorisasi diperiksa di ContentService (izin bergantung pada tipe konten `:apiId`), bukan di sini. */
export function contentRoutes(app: FastifyInstance, c: Controllers): void {
  app.get('/api/content/:apiId', c.content.list);
  app.get('/api/content/:apiId/:id', c.content.get);
  app.post('/api/content/:apiId', c.content.create);
  app.patch('/api/content/:apiId/:id', c.content.update);
  app.delete('/api/content/:apiId/:id', c.content.remove);
}
