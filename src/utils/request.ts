import type { FastifyRequest } from 'fastify';
import type { RequestMeta } from '../types/http.js';

export const requestMeta = (req: FastifyRequest): RequestMeta => ({ ip: req.ip, userAgent: req.headers['user-agent'] ?? '' });
