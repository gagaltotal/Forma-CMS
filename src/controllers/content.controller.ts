import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppContext } from '../core/container.js';
import { contentParams } from '../validators/common.validator.js';
import { getQuerySchema, parseListQuery } from '../validators/query.validator.js';
import { parseWith } from '../validators/parse.js';

/** API konten publik/terautentikasi. Otorisasi per-tipe dilakukan ContentService karena bergantung pada `apiId`. */
export class ContentController {
  constructor(private ctx: AppContext) {}
  private get content() { return this.ctx.services.content; }

  list = async (req: FastifyRequest) => {
    const { apiId } = contentParams.parse(req.params);
    return this.content.list(req.principal, apiId, parseListQuery(req.query));
  };
  get = async (req: FastifyRequest) => {
    const { apiId, id } = contentParams.parse(req.params);
    const q = parseWith(getQuerySchema, req.query);
    return { data: await this.content.get(req.principal, apiId, id!, q.populate) };
  };
  create = async (req: FastifyRequest, reply: FastifyReply) => {
    const { apiId } = contentParams.parse(req.params);
    return reply.code(201).send({ data: await this.content.create(req.principal, apiId, req.body) });
  };
  update = async (req: FastifyRequest) => {
    const { apiId, id } = contentParams.parse(req.params);
    return { data: await this.content.update(req.principal, apiId, id!, req.body) };
  };
  remove = async (req: FastifyRequest, reply: FastifyReply) => {
    const { apiId, id } = contentParams.parse(req.params);
    await this.content.remove(req.principal, apiId, id!);
    return reply.code(204).send();
  };
}
