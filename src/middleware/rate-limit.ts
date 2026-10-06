import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';
import { AUTH, RATE } from '../config/constants.js';
import type { Config } from '../config/index.js';
import { HttpError } from '../utils/errors.js';

export async function registerRateLimit(app: FastifyInstance, cfg: Config): Promise<void> {
  await app.register(rateLimit, {
    global: true,
    max: cfg.RATE_LIMIT_PER_MINUTE,
    timeWindow: '1 minute',
    keyGenerator: (req) => req.ip,
    allowList: cfg.rateLimitAllowlist,
    errorResponseBuilder: (_req, c) => new HttpError(429, 'rate_limited', `Too many requests. Try again in ${Math.ceil(c.ttl / 1000)}s`),
  });
}

/** Preset per-endpoint (nilai `config` route). Endpoint sensitif TIDAK pernah masuk allowlist (`allowList: []`). */
export const limits = {
  login: (cfg: Config) => ({ rateLimit: { max: cfg.LOGIN_MAX_PER_15MIN, timeWindow: AUTH.LOGIN_WINDOW, allowList: [] as string[] } }),
  passwordChange: () => ({ rateLimit: { max: AUTH.PASSWORD_CHANGE_MAX, timeWindow: AUTH.LOGIN_WINDOW, allowList: [] as string[] } }),
  sso: (cfg: Config) => ({ rateLimit: { max: cfg.LOGIN_MAX_PER_15MIN, timeWindow: AUTH.LOGIN_WINDOW, allowList: [] as string[] } }),
  upload: () => ({ rateLimit: { max: RATE.UPLOAD_PER_MINUTE, timeWindow: '1 minute' } }),
  graphql: () => ({ rateLimit: { max: RATE.GRAPHQL_PER_MINUTE, timeWindow: '1 minute' } }),
};
