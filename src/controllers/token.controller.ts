import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppContext } from '../core/container.js';
import { uuidParams } from '../validators/common.validator.js';

export class TokenController {
  constructor(private ctx: AppContext) {}
  private get tokens() { return this.ctx.services.tokens; }

  list = async () => ({ data: await this.tokens.list() });
  create = async (req: FastifyRequest, reply: FastifyReply) => reply.code(201).send({ data: await this.tokens.create(req.principal, req.body) });
  revoke = async (req: FastifyRequest) => {
    await this.tokens.revoke(req.principal, uuidParams.parse(req.params).id);
    return { ok: true };
  };
}
