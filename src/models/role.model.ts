import { BaseModel } from './base.model.js';

export interface RoleRow { id: string; name: string; description: string; is_system: boolean | number; permissions: string; created_at: number }

export class RoleModel extends BaseModel {
  all(): Promise<RoleRow[]> { return this.db('forma_roles').orderBy('created_at'); }
  find(id: string): Promise<RoleRow | undefined> { return this.db('forma_roles').where({ id }).first(); }
  async exists(id: string): Promise<boolean> { return !!(await this.db('forma_roles').where({ id }).first('id')); }

  async permissionsOf(id: string): Promise<string[]> {
    const r = await this.db('forma_roles').where({ id }).first('permissions');
    return r ? (JSON.parse(r.permissions) as string[]) : [];
  }
  async superAdminIds(): Promise<string[]> {
    const rows = await this.db('forma_roles').select('id', 'permissions');
    return rows.filter((r: RoleRow) => (JSON.parse(r.permissions) as string[]).includes('*')).map((r: RoleRow) => r.id);
  }

  insert(row: Omit<RoleRow, never>): Promise<unknown> { return this.db('forma_roles').insert(row); }
  update(id: string, patch: Partial<RoleRow>): Promise<number> { return this.db('forma_roles').where({ id }).update(patch); }
  delete(id: string): Promise<number> { return this.db('forma_roles').where({ id }).delete(); }
}
