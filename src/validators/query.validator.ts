import { z } from 'zod';
import { badRequest } from '../utils/errors.js';
import { FILTER_OPS, type Filter, type ListParams, type Op } from '../types/content.js';
import { PAGINATION } from '../config/constants.js';
import { parseWith } from './parse.js';

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(PAGINATION.MAX).default(PAGINATION.DEFAULT),
  sort: z.string().max(200).optional(),
  populate: z.string().max(300).optional(),
  q: z.string().max(100).optional(),
  filter: z.record(z.string().max(40), z.record(z.string().max(12), z.union([z.string().max(255), z.array(z.string().max(255)).max(50)]))).optional(),
}).strict();

export const getQuerySchema = z.object({ populate: z.string().max(300).optional() }).strict();

/** Query string (hasil parser `qs`) -> ListParams terstruktur. Nama kolom divalidasi ulang oleh model terhadap skema. */
export function parseListQuery(query: unknown): ListParams {
  const r = parseWith(listQuerySchema, query);
  const filter: Filter[] = [];
  for (const [field, ops] of Object.entries(r.filter ?? {})) {
    for (const [op, value] of Object.entries(ops)) {
      if (!(FILTER_OPS as readonly string[]).includes(op)) throw badRequest(`Unknown filter operator "${op.slice(0, 12)}"`);
      filter.push({ field, op: op as Op, value });
    }
  }
  if (filter.length > 10) throw badRequest('Too many filters (max 10)');
  return { page: r.page, pageSize: r.pageSize, sort: r.sort, populate: r.populate, q: r.q, filter };
}
