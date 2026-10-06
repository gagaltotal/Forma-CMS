import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppContext } from '../core/container.js';

export class GraphQLController {
  constructor(private ctx: AppContext) {}

  execute = async (req: FastifyRequest, reply: FastifyReply) => {
    const r = await this.ctx.services.graphql.run(req.principal, req.body, (err) => req.log.error({ err }, 'graphql resolver error'));
    return reply.code(r.status).send(r.payload);
  };

  methodNotAllowed = async (_req: FastifyRequest, reply: FastifyReply) =>
    reply.code(405).header('Allow', 'POST').send({ errors: [{ message: 'Use POST' }] });
}
