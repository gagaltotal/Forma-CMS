import { BaseModel } from './base.model.js';

export interface ApiTokenRow {
  id: string; name: string; token_hash: string; token_prefix: string; role_id: string; created_by: string | null;
  expires_at: number | null; last_used_at: number | null; created_at: number;
}
export type ApiTokenWithRole = ApiTokenRow & { role_name: string };

export class ApiTokenModel extends BaseModel {
  findByHash(hash: string): Promise<ApiTokenRow | undefined> { return this.db('forma_api_tokens').where({ token_hash: hash }).first(); }
  listWithRoles(): Promise<ApiTokenWithRole[]> {
    return this.db('forma_api_tokens as t').join('forma_roles as r', 'r.id', 't.role_id').select('t.*', 'r.name as role_name').orderBy('t.created_at', 'desc');
  }
  insert(row: ApiTokenRow): Promise<unknown> { return this.db('forma_api_tokens').insert(row); }
  delete(id: string): Promise<number> { return this.db('forma_api_tokens').where({ id }).delete(); }
  touch(id: string, now: number): Promise<number> { return this.db('forma_api_tokens').where({ id }).update({ last_used_at: now }); }
}
