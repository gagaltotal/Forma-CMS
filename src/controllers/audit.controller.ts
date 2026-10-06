import type { FastifyRequest } from 'fastify';
import type { AppContext } from '../core/container.js';
import { pageQuery } from '../validators/common.validator.js';
import { parseWith } from '../validators/parse.js';

export class AuditController {
  constructor(private ctx: AppContext) {}
  list = async (req: FastifyRequest) => {
    const q = parseWith(pageQuery, req.query);
    return this.ctx.services.audit.list(q.page, q.pageSize);
  };
  verify = async () => this.ctx.services.audit.verify();
}
