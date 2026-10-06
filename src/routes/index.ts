import type { FastifyInstance } from 'fastify';
import { createControllers } from '../controllers/index.js';
import type { AppContext } from '../core/container.js';
import { adminUiRoutes } from './admin-ui.routes.js';
import { auditRoutes } from './audit.routes.js';
import { authRoutes } from './auth.routes.js';
import { contentRoutes } from './content.routes.js';
import { contentTypeRoutes } from './content-type.routes.js';
import { graphqlRoutes } from './graphql.routes.js';
import { healthRoutes } from './health.routes.js';
import { mediaRoutes } from './media.routes.js';
import { passwordResetRoutes } from './password-reset.routes.js';
import { roleRoutes } from './role.routes.js';
import { ssoRoutes } from './sso.routes.js';
import { tokenRoutes } from './token.routes.js';
import { totpRoutes } from './totp.routes.js';
import { userRoutes } from './user.routes.js';
import { versionRoutes } from './version.routes.js';

/** Satu-satunya tempat yang merakit URL -> middleware -> controller. */
export async function registerRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const c = createControllers(ctx);
  healthRoutes(app, c);
  authRoutes(app, c, ctx);
  userRoutes(app, c);
  roleRoutes(app, c);
  tokenRoutes(app, c);
  contentTypeRoutes(app, c);
  auditRoutes(app, c);
  contentRoutes(app, c);
  mediaRoutes(app, c);
  graphqlRoutes(app, c);
  totpRoutes(app, c, ctx);
  passwordResetRoutes(app, c, ctx);
  versionRoutes(app, c, ctx);
  ssoRoutes(app, c, ctx);
  await adminUiRoutes(app, ctx);
}
