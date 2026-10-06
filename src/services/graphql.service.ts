import { execute, NoSchemaIntrospectionCustomRule, parse, specifiedRules, validate, type DocumentNode, type GraphQLSchema } from 'graphql';
import type { Config } from '../config/index.js';
import { GRAPHQL } from '../config/constants.js';
import { buildSchema, type GqlCtx } from '../graphql/builder.js';
import { complexityViolation } from '../graphql/guard.js';
import type { Principal } from '../security/permissions.js';
import { HttpError } from '../utils/errors.js';
import { graphqlBody } from '../validators/graphql.validator.js';
import type { ContentService } from './content.service.js';
import type { SchemaService } from './schema.service.js';

export interface GraphQLResult { status: number; payload: unknown }

/** Pipeline eksekusi aman: validasi body -> parse -> validate (+blok introspeksi) -> batas kompleksitas -> execute -> mask error. */
export class GraphQLService {
  private cached: GraphQLSchema | null = null;
  private version = -1;

  constructor(private cfg: Config, private schema: SchemaService, private content: ContentService) {}

  /** Skema dibangun ulang hanya jika tipe konten berubah. */
  private getSchema(): GraphQLSchema {
    if (!this.cached || this.version !== this.schema.version) {
      this.cached = buildSchema({ content: this.content, schema: this.schema });
      this.version = this.schema.version;
    }
    return this.cached;
  }

  async run(principal: Principal, body: unknown, logError: (err: unknown) => void): Promise<GraphQLResult> {
    const fail = (message: string, status = 400): GraphQLResult => ({ status, payload: { errors: [{ message }] } });

    const b = graphqlBody.safeParse(body);
    if (!b.success) return fail('Invalid GraphQL request');

    let doc: DocumentNode;
    try { doc = parse(b.data.query, { maxTokens: GRAPHQL.MAX_PARSER_TOKENS }); }
    catch (e: any) { return fail(`Syntax error: ${String(e?.message).slice(0, 200)}`); }

    const schema = this.getSchema();
    const rules = this.cfg.GRAPHQL_INTROSPECTION ? specifiedRules : [...specifiedRules, NoSchemaIntrospectionCustomRule];
    const errs = validate(schema, doc, rules);
    if (errs.length) return { status: 400, payload: { errors: errs.slice(0, 5).map((e) => ({ message: e.message, locations: e.locations })) } };

    const tooComplex = complexityViolation(doc);
    if (tooComplex) return fail(tooComplex);

    const result = await execute({
      schema, document: doc, variableValues: b.data.variables ?? undefined, operationName: b.data.operationName ?? undefined,
      contextValue: { principal, cache: new Map() } satisfies GqlCtx,
    });
    // Error internal (SQL, stack, dll.) tidak pernah dikirim ke klien; hanya HttpError yang aman.
    const errors = result.errors?.map((e) => {
      if (e.originalError instanceof HttpError) return { message: e.originalError.message, path: e.path, extensions: { code: e.originalError.code } };
      if (e.originalError) { logError(e.originalError); return { message: 'Internal error', path: e.path }; }
      return { message: e.message, path: e.path, locations: e.locations };
    });
    return { status: 200, payload: { data: result.data ?? null, ...(errors ? { errors } : {}) } };
  }
}
