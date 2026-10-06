import '@fastify/cookie';
import '@fastify/multipart';
import type { AppContext } from '../core/container.js';
import type { Principal } from '../security/permissions.js';

export interface SessionInfo { id: string; userId: string; csrf: string }

declare module 'fastify' {
  interface FastifyRequest {
    /** Identitas hasil middleware `authenticate` (publik / sesi pengguna / API token). */
    principal: Principal;
    session: SessionInfo | null;
    viaBearer: boolean;
  }
  interface FastifyInstance {
    ctx: AppContext;
  }
}
