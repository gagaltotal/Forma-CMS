import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppContext } from '../core/container.js';
import { roleIdParams } from '../validators/common.validator.js';

export class RoleController {
  constructor(private ctx: AppContext) {}
  private get roles() { return this.ctx.services.roles; }

  list = async () => ({ data: await this.roles.list() });
  create = async (req: FastifyRequest, reply: FastifyReply) => reply.code(201).send({ data: await this.roles.create(req.principal, req.body) });
  update = async (req: FastifyRequest) => ({ data: await this.roles.update(req.principal, roleIdParams.parse(req.params).id, req.body) });
  remove = async (req: FastifyRequest) => {
    await this.roles.remove(req.principal, roleIdParams.parse(req.params).id);
    return { ok: true };
  };
}
