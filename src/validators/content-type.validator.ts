import { z } from 'zod';
import { FIELD_TYPES } from '../types/content.js';

/* Validasi DEFINISI tipe konten. Identifier (apiId/nama field) dibatasi regex ketat karena menjadi nama tabel/kolom. */

export const NAME_RE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;
export const NO_CTRL = /^[^\u0000-\u001F\u007F]+$/;
export const RESERVED_FIELDS = new Set(['id', 'status', 'created_at', 'updated_at', 'published_at', 'created_by', 'constructor', 'prototype', 'proto']);
export const RESERVED_API = new Set(['ping', 'forma', 'admin', 'auth', 'graphql', 'api']);
export const RESERVED_GQL = new Set([
  'Media', 'Query', 'Mutation', 'Subscription', 'JSON', 'FilterInput', 'FilterOp',
  'String', 'Int', 'Float', 'Boolean', 'ID',
]);

export const fieldSchema = z.object({
  name: z.string().min(1).max(40).regex(NAME_RE, 'Use lowercase letters, digits and single underscores'),
  type: z.enum(FIELD_TYPES),
  label: z.string().max(80).optional(),
  help: z.string().max(200).optional(),
  required: z.boolean().optional(),
  unique: z.boolean().optional(),
  min: z.number().finite().optional(),
  max: z.number().finite().optional(),
  values: z.array(z.string().min(1).max(60).regex(NO_CTRL)).max(50).optional(),
  target: z.string().max(40).regex(NAME_RE).optional(),
}).strict();

export const contentTypeInput = z.object({
  apiId: z.string().min(2).max(40).regex(NAME_RE, 'Use lowercase letters, digits and single underscores'),
  pluralId: z.string().min(2).max(44).regex(NAME_RE).optional(),
  displayName: z.string().trim().min(1).max(100),
  fields: z.array(fieldSchema).max(60),
}).strict();
export type ContentTypeInput = z.infer<typeof contentTypeInput>;
