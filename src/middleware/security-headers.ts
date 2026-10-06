import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import type { FastifyInstance } from 'fastify';
import type { Config } from '../config/index.js';

/** Header keamanan, CORS (allowlist), cookie parser, dan batas multipart. */
export async function registerSecurity(app: FastifyInstance, cfg: Config): Promise<void> {
  await app.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'"], imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'"], connectSrc: ["'self'"], objectSrc: ["'none'"], baseUri: ["'none'"],
        frameAncestors: ["'none'"], formAction: ["'self'"],
      },
    },
    strictTransportSecurity: cfg.cookieSecure ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    referrerPolicy: { policy: 'no-referrer' },
    crossOriginResourcePolicy: { policy: 'same-origin' },
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    xFrameOptions: { action: 'deny' },
  });
  app.addHook('onSend', async (_req, reply) => {
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()');
    reply.removeHeader('X-Powered-By');
  });

  await app.register(cors, {
    origin: cfg.corsOrigins.length ? cfg.corsOrigins : false, // allowlist eksplisit; default: tidak ada CORS
    credentials: false, // cookie sesi TIDAK PERNAH dikirim lintas-origin
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    maxAge: 600,
  });
  await app.register(cookie);
  await app.register(multipart, {
    limits: { fileSize: cfg.MAX_UPLOAD_MB * 1024 * 1024, files: 1, fields: 5, parts: 6, headerPairs: 50, fieldSize: 1024 },
  });
}
