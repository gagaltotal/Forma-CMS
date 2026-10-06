/** Tipe domain yang dipakai lintas lapisan (validators, models, services, graphql). */

export const FIELD_TYPES = [
  'text', 'longtext', 'richtext', 'integer', 'float', 'boolean', 'datetime',
  'email', 'slug', 'enum', 'json', 'media', 'relation',
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export interface FieldDef {
  name: string;
  type: FieldType;
  label?: string;
  help?: string;
  required?: boolean;
  unique?: boolean;
  min?: number;
  max?: number;
  values?: string[]; // enum
  target?: string; // relation -> apiId tipe target
}

export interface ContentType {
  id: string;
  apiId: string;
  pluralId: string;
  displayName: string;
  fields: FieldDef[];
  createdAt: number;
  updatedAt: number;
}

export const FILTER_OPS = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'startsWith', 'in', 'null'] as const;
export type Op = (typeof FILTER_OPS)[number];
export interface Filter { field: string; op: Op; value: string | string[] }
export interface ListParams { page: number; pageSize: number; sort?: string; populate?: string; q?: string; filter?: Filter[] }

export type Entry = Record<string, unknown>;
export interface MediaView { id: string; url: string; name: string; mime: string; size: number; alt: string }
