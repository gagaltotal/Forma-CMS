import type { FastifyRequest } from 'fastify';
import { can } from '../security/permissions.js';
import { forbidden, unauthorized } from '../utils/errors.js';

/** preHandler: pemanggil (sesi, token, atau publik) harus punya izin `perm`. Publik -> 401, selainnya -> 403. */
export function requirePermission(perm: string) {
  return async (req: FastifyRequest): Promise<void> => {
    if (!can(req.principal.perms, perm)) throw req.principal.kind === 'public' ? unauthorized() : forbidden();
  };
}

/** preHandler untuk endpoint administrasi: HANYA sesi pengguna (API token tidak pernah boleh), opsional dengan izin tertentu. */
export function requireUser(perm?: string) {
  return async (req: FastifyRequest): Promise<void> => {
    if (req.principal.kind !== 'user') throw unauthorized();
    if (perm && !can(req.principal.perms, perm)) throw forbidden();
  };
}

/** preHandler: harus ada sesi cookie yang valid (mis. /me, ganti password). */
export async function requireSession(req: FastifyRequest): Promise<void> {
  if (!req.session) throw unauthorized();
}

/** preHandler: sesi pengguna dengan SALAH SATU dari izin yang disebut (mis. daftar role dibutuhkan pengelola user/role/token). */
export function requireUserAny(perms: string[]) {
  return async (req: FastifyRequest): Promise<void> => {
    if (req.principal.kind !== 'user') throw unauthorized();
    if (!perms.some((p) => can(req.principal.perms, p))) throw forbidden();
  };
}
