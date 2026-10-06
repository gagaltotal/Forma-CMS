import type { FastifyInstance } from 'fastify';
import type { Controllers } from '../controllers/index.js';
import { limits } from '../middleware/rate-limit.js';

export function graphqlRoutes(app: FastifyInstance, c: Controllers): void {
  app.get('/graphql', c.graphql.methodNotAllowed);
  app.post('/graphql', { config: limits.graphql() }, c.graphql.execute);
}
