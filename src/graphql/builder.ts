import {
  GraphQLBoolean, GraphQLEnumType, GraphQLFloat, GraphQLID, GraphQLInputObjectType, GraphQLInt,
  GraphQLList, GraphQLNonNull, GraphQLObjectType, GraphQLScalarType, GraphQLSchema, GraphQLString, Kind,
  valueFromASTUntyped,
  type GraphQLFieldConfigMap, type GraphQLOutputType,
} from 'graphql';
import type { ContentService } from '../services/content.service.js';
import type { SchemaService } from '../services/schema.service.js';
import { parseListQuery } from '../validators/query.validator.js';
import type { Filter, FieldDef, Op } from '../types/content.js';
import { HttpError } from '../utils/errors.js';
import type { Principal } from '../security/permissions.js';
import { pascal } from '../utils/naming.js';

/** Konteks per-request untuk resolver: identitas + cache kecil agar relasi yang sama tidak di-query berulang. */
export interface GqlCtx { principal: Principal; cache: Map<string, Promise<unknown>> }

const nn = <T extends GraphQLOutputType | GraphQLScalarType | GraphQLEnumType | GraphQLInputObjectType>(t: T) => new GraphQLNonNull(t);

/** Membangun skema GraphQL secara dinamis dari tipe konten. Resolver memakai ContentService (otorisasi sama dengan REST). */
export function buildSchema(deps: { content: ContentService; schema: SchemaService }): GraphQLSchema {
  const svc = deps.content;
  const JSONScalar = new GraphQLScalarType({
    name: 'JSON',
    serialize: (v) => v,
    parseValue: (v) => v,
    parseLiteral: (ast, vars) => valueFromASTUntyped(ast, vars),
  });
  const cached = <T>(c: GqlCtx, key: string, fn: () => Promise<T>): Promise<T> => {
    if (!c.cache.has(key)) c.cache.set(key, fn());
    return c.cache.get(key) as Promise<T>;
  };

  const MediaType = new GraphQLObjectType({
    name: 'Media',
    fields: { id: { type: nn(GraphQLID) }, url: { type: nn(GraphQLString) }, name: { type: nn(GraphQLString) }, mime: { type: nn(GraphQLString) }, size: { type: nn(GraphQLInt) }, alt: { type: nn(GraphQLString) } },
  });
  const FilterOp = new GraphQLEnumType({
    name: 'FilterOp',
    // `null` dilarang sebagai nama enum GraphQL -> diekspos sebagai `isNull`.
    values: Object.fromEntries(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'startsWith', 'in', 'isNull'].map((k) => [k, { value: k === 'isNull' ? 'null' : k }])),
  });
  const FilterInput = new GraphQLInputObjectType({
    name: 'FilterInput',
    fields: { field: { type: nn(GraphQLString) }, op: { type: nn(FilterOp) }, value: { type: GraphQLString }, values: { type: new GraphQLList(nn(GraphQLString)) } },
  });

  const cts = deps.schema.list();
  const objTypes = new Map<string, GraphQLObjectType>();

  const scalarFor = (f: FieldDef): GraphQLOutputType => {
    switch (f.type) {
      case 'integer': return GraphQLInt;
      case 'float': return GraphQLFloat;
      case 'boolean': return GraphQLBoolean;
      case 'json': return JSONScalar;
      default: return GraphQLString;
    }
  };

  for (const ct of cts) {
    objTypes.set(ct.apiId, new GraphQLObjectType({
      name: pascal(ct.apiId),
      fields: () => {
        const fields: GraphQLFieldConfigMap<any, GqlCtx> = {
          id: { type: nn(GraphQLID) }, status: { type: nn(GraphQLString) },
          createdAt: { type: nn(GraphQLString) }, updatedAt: { type: nn(GraphQLString) }, publishedAt: { type: GraphQLString },
        };
        for (const f of ct.fields) {
          if (f.type === 'media') {
            fields[f.name] = { type: MediaType, resolve: (src, _a, c) => (typeof src[f.name] === 'string' ? cached(c, `m:${src[f.name]}`, () => svc.mediaById(src[f.name])) : src[f.name] ?? null) };
          } else if (f.type === 'relation') {
            const target = f.target!;
            fields[f.name] = { type: objTypes.get(target)!, resolve: (src, _a, c) => (typeof src[f.name] === 'string' ? cached(c, `r:${target}:${src[f.name]}`, () => svc.getOptional(c.principal, target, src[f.name])) : src[f.name] ?? null) };
          } else {
            fields[f.name] = { type: scalarFor(f) };
          }
        }
        return fields;
      },
    }));
  }

  const query: GraphQLFieldConfigMap<unknown, GqlCtx> = { ping: { type: GraphQLString, resolve: () => 'pong' } };
  const mutation: GraphQLFieldConfigMap<unknown, GqlCtx> = {};

  for (const ct of cts) {
    const T = objTypes.get(ct.apiId)!;
    const P = pascal(ct.apiId);
    const Page = new GraphQLObjectType({
      name: `${P}Page`,
      fields: { items: { type: nn(new GraphQLList(nn(T))) }, total: { type: nn(GraphQLInt) }, page: { type: nn(GraphQLInt) }, pageSize: { type: nn(GraphQLInt) } },
    });

    query[ct.apiId] = {
      type: T,
      args: { id: { type: nn(GraphQLID) } },
      resolve: async (_s, a, c) => {
        try { return await svc.get(c.principal, ct.apiId, String(a.id)); }
        catch (e) { if (e instanceof HttpError && e.status === 404) return null; throw e; }
      },
    };
    query[ct.pluralId] = {
      type: nn(Page),
      args: { page: { type: GraphQLInt }, pageSize: { type: GraphQLInt }, sort: { type: GraphQLString }, q: { type: GraphQLString }, filter: { type: new GraphQLList(nn(FilterInput)) } },
      resolve: async (_s, a, c) => {
        const raw: Record<string, unknown> = {};
        for (const k of ['page', 'pageSize', 'sort', 'q']) if (a[k] !== undefined && a[k] !== null) raw[k] = a[k];
        const params = parseListQuery(raw);
        params.filter = (a.filter ?? []).slice(0, 10).map((f: any): Filter => {
          const value = f.op === 'in' ? (f.values ?? []).slice(0, 50) : (f.value ?? '');
          if ((Array.isArray(value) ? value : [value]).some((v: string) => v.length > 255)) throw new HttpError(400, 'validation_error', 'Filter value too long');
          return { field: String(f.field).slice(0, 40), op: f.op as Op, value };
        });
        const r = await svc.list(c.principal, ct.apiId, params);
        return { items: r.data, total: r.meta.total, page: r.meta.page, pageSize: r.meta.pageSize };
      },
    };

    mutation[`create${P}`] = {
      type: T,
      args: { data: { type: nn(JSONScalar) }, status: { type: GraphQLString } },
      resolve: (_s, a, c) => svc.create(c.principal, ct.apiId, { data: a.data, ...(a.status ? { status: a.status } : {}) }),
    };
    mutation[`update${P}`] = {
      type: T,
      args: { id: { type: nn(GraphQLID) }, data: { type: JSONScalar }, status: { type: GraphQLString } },
      resolve: (_s, a, c) => svc.update(c.principal, ct.apiId, String(a.id), { ...(a.data ? { data: a.data } : {}), ...(a.status ? { status: a.status } : {}) }),
    };
    mutation[`delete${P}`] = {
      type: nn(GraphQLBoolean),
      args: { id: { type: nn(GraphQLID) } },
      resolve: async (_s, a, c) => { await svc.remove(c.principal, ct.apiId, String(a.id)); return true; },
    };
  }

  return new GraphQLSchema({
    query: new GraphQLObjectType({ name: 'Query', fields: query }),
    mutation: Object.keys(mutation).length ? new GraphQLObjectType({ name: 'Mutation', fields: mutation }) : undefined,
    types: [MediaType],
  });
}

