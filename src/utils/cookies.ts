import type { FastifyReply } from 'fastify';
import type { Config } from '../config/index.js';

/** Cookie sesi: HttpOnly, SameSite=Strict, Path=/ (+ Secure & prefix __Host- di HTTPS). */
export function setSessionCookie(cfg: Config, reply: FastifyReply, token: string): void {
  reply.setCookie(cfg.cookieName, token, {
    httpOnly: true, secure: cfg.cookieSecure, sameSite: 'strict', path: '/', maxAge: cfg.SESSION_MAX_HOURS * 3600,
  });
}
export function clearSessionCookie(cfg: Config, reply: FastifyReply): void {
  reply.clearCookie(cfg.cookieName, { httpOnly: true, secure: cfg.cookieSecure, sameSite: 'strict', path: '/' });
}
