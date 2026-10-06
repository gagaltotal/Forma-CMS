import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { HttpError } from '../utils/errors.js';

/** Error terpusat: tidak ada stack trace / SQL yang bocor. Hanya HttpError & error klien 4xx Fastify yang dikirim apa adanya. */
export function registerErrorHandlers(app: FastifyInstance): void {
  app.setErrorHandler((err: any, req, reply) => {
    if (err instanceof HttpError) {
      return reply.code(err.status).send({ error: { code: err.code, message: err.message, ...(err.issues ? { issues: err.issues } : {}) } });
    }
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Validation failed', issues: err.issues.slice(0, 20).map((i) => ({ path: i.path.join('.'), message: i.message })) } });
    }
    const status = Number(err?.statusCode);
    if (status >= 400 && status < 500) {
      return reply.code(status).send({ error: { code: String(err.code ?? 'bad_request').toLowerCase(), message: err.message } });
    }
    req.log.error({ err }, 'unhandled error');
    return reply.code(500).send({ error: { code: 'internal_error', message: 'Internal server error', requestId: req.id } });
  });

  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: { code: 'not_found', message: 'Not found' } }));
}
