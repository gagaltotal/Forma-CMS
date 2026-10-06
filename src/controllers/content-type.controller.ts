import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppContext } from '../core/container.js';
import { can, hasAnyOnType } from '../security/permissions.js';
import { apiIdParams } from '../validators/common.validator.js';

/** Builder tipe konten. Daftar tipe terlihat oleh semua staf (sebatas tipe yang mereka punya izinnya); perubahan skema butuh `schema:manage`. */
export class ContentTypeController {
  constructor(private ctx: AppContext) {}
  private get schema() { return this.ctx.services.schema; }

  list = async (req: FastifyRequest) => {
    const manage = can(req.principal.perms, 'schema:manage');
    return { data: this.schema.list().filter((c) => manage || hasAnyOnType(req.principal.perms, c.apiId)) };
  };
  create = async (req: FastifyRequest, reply: FastifyReply) => reply.code(201).send({ data: await this.schema.create(req.body, req.principal) });
  update = async (req: FastifyRequest) => ({ data: await this.schema.update(apiIdParams.parse(req.params).apiId, req.body, req.principal) });
  remove = async (req: FastifyRequest) => {
    await this.schema.remove(apiIdParams.parse(req.params).apiId, req.principal);
    return { ok: true };
  };
}
