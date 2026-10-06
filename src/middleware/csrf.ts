import type { FastifyRequest } from 'fastify';
import type { AppContext } from '../core/container.js';
import { safeEqual } from '../security/tokens.js';
import { HttpError } from '../utils/errors.js';

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Perlindungan CSRF untuk request berbasis cookie: cek header Origin (juga untuk login) + token per-sesi
 * (+ SameSite=Strict di cookie). Request ber-Bearer dikecualikan karena tidak memakai kredensial ambient.
 */
export function csrfProtection(ctx: AppContext) {
  return async (req: FastifyRequest): Promise<void> => {
    if (!UNSAFE.has(req.method) || req.viaBearer) return;
    const origin = req.headers.origin;
    if (origin !== undefined && origin !== ctx.cfg.publicOrigin) {
      throw new HttpError(403, 'bad_origin', 'Cross-origin request blocked');
    }
    if (req.session) {
      const sent = req.headers['x-csrf-token'];
      if (typeof sent !== 'string' || !safeEqual(sent, req.session.csrf)) {
        throw new HttpError(403, 'csrf_failed', 'Missing or invalid CSRF token');
      }
    }
  };
}
