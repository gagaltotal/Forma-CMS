import type { FastifyInstance } from 'fastify';
import type { Controllers } from '../controllers/index.js';
import { authenticate } from '../middleware/authenticate.js';
import type { AppContext } from '../core/container.js';

export function totpRoutes(app: FastifyInstance, c: Controllers, ctx: AppContext): void {
  const auth = authenticate(ctx);

  app.get('/api/totp/status', { preHandler: [auth] }, c.totp.status);
  app.post('/api/totp/setup', { preHandler: [auth] }, c.totp.setup);
  app.post('/api/totp/enable', { preHandler: [auth] }, c.totp.enable);
  app.post('/api/totp/disable', { preHandler: [auth] }, c.totp.disable);
  app.post('/api/totp/regenerate-backup-codes', { preHandler: [auth] }, c.totp.regenerateBackupCodes);
}
