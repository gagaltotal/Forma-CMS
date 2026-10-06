import type { FastifyInstance } from 'fastify';
import type { Controllers } from '../controllers/index.js';
import type { AppContext } from '../core/container.js';

export function passwordResetRoutes(app: FastifyInstance, c: Controllers, _ctx: AppContext): void {
  // Rute publik - tidak butuh autentikasi
  app.post('/api/password-reset/request', c.passwordReset.request);
  app.post('/api/password-reset/reset', c.passwordReset.reset);
}
