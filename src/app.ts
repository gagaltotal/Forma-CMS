import Fastify from 'fastify';
import qs from 'qs';
import { BODY_LIMIT_BYTES } from './config/constants.js';
import type { Config } from './config/index.js';
import { createContainer, type AppContext } from './core/container.js';
import { createDb } from './database/connection.js';
import { migrate } from './database/migrate.js';
import { registerErrorHandlers } from './middleware/error-handler.js';
import { registerRequestPipeline } from './middleware/pipeline.js';
import { registerRateLimit } from './middleware/rate-limit.js';
import { registerSecurity } from './middleware/security-headers.js';
import { registerRoutes } from './routes/index.js';

/** Composition root: database -> migrasi -> container (models, services) -> plugin & middleware -> routes. */
export async function buildApp(cfg: Config, opts: { logger?: boolean } = {}) {
  const db = createDb(cfg);
  await migrate(db);
  const ctx: AppContext = await createContainer(cfg, db);

  const app = Fastify({
    logger: opts.logger === false ? false : {
      level: cfg.NODE_ENV === 'production' ? 'info' : 'debug',
      // Kredensial tidak boleh masuk log.
      redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
    },
    trustProxy: cfg.TRUST_PROXY,
    bodyLimit: BODY_LIMIT_BYTES,
    routerOptions: {
      querystringParser: (s) => qs.parse(s, { depth: 3, arrayLimit: 50, parameterLimit: 50, plainObjects: true, allowPrototypes: false }) as Record<string, unknown>,
    },
  });

  await registerSecurity(app, cfg);          // helmet, CORS, cookie, multipart
  await registerRateLimit(app, cfg);         // rate limit global (+ preset per-route)
  registerRequestPipeline(app, ctx);         // no-store -> authenticate -> CSRF
  registerErrorHandlers(app);                // error terpusat + 404
  await registerRoutes(app, ctx);            // routes -> middleware -> controllers -> services -> models

  app.addHook('onClose', async () => { await db.destroy(); });
  return { app, ctx };
}
