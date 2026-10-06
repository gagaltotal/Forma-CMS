import { z } from 'zod';
import { GRAPHQL } from '../config/constants.js';

/** Objek tunggal (bukan array) -> batching query otomatis ditolak. */
export const graphqlBody = z.object({
  query: z.string().min(1).max(GRAPHQL.MAX_QUERY_LENGTH),
  variables: z.record(z.string(), z.unknown()).nullish(),
  operationName: z.string().max(100).nullish(),
}).strict();
