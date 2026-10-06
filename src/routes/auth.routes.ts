import type { FastifyInstance } from 'fastify';
import type { Controllers } from '../controllers/index.js';
import type { AppContext } from '../core/container.js';
import { requireSession } from '../middleware/authorize.js';
import { limits } from '../middleware/rate-limit.js';

export function authRoutes(app: FastifyInstance, c: Controllers, ctx: AppContext): void {
  app.post('/api/auth/login', { config: limits.login(ctx.cfg) }, c.auth.login);
  app.get('/api/auth/me', { preHandler: [requireSession] }, c.auth.me);
  app.post('/api/auth/logout', c.auth.logout);
  app.post('/api/auth/password', { preHandler: [requireSession], config: limits.passwordChange() }, c.auth.changePassword);
}
