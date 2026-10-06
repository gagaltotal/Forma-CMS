import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppContext } from '../core/container.js';
import { uuidParams } from '../validators/common.validator.js';

export class UserController {
  constructor(private ctx: AppContext) {}
  private get users() { return this.ctx.services.users; }

  list = async () => ({ data: await this.users.list() });
  create = async (req: FastifyRequest, reply: FastifyReply) => reply.code(201).send({ data: await this.users.create(req.principal, req.body) });
  update = async (req: FastifyRequest) => {
    await this.users.update(req.principal, uuidParams.parse(req.params).id, req.body);
    return { ok: true };
  };
  remove = async (req: FastifyRequest) => {
    await this.users.remove(req.principal, uuidParams.parse(req.params).id);
    return { ok: true };
  };
}
