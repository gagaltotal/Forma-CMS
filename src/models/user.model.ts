import { BaseModel } from './base.model.js';

export interface UserRow {
  id: string; email: string; name: string; password_hash: string; role_id: string; active: boolean | number;
  failed_attempts: number; locked_until: number | null; created_at: number; last_login_at: number | null;
  totp_secret?: string | null; totp_enabled?: boolean | number | null; backup_codes?: string | null;
}
export type UserWithRole = UserRow & { role_name: string };

export class UserModel extends BaseModel {
  findByEmail(email: string): Promise<UserRow | undefined> { return this.db('forma_users').where({ email }).first(); }
  find(id: string): Promise<UserRow | undefined> { return this.db('forma_users').where({ id }).first(); }
  listWithRoles(): Promise<UserWithRole[]> {
    return this.db('forma_users as u').join('forma_roles as r', 'r.id', 'u.role_id').select('u.*', 'r.name as role_name').orderBy('u.created_at');
  }
  async count(): Promise<number> {
    const r: any = await this.db('forma_users').count({ c: '*' }).first();
    return Number(r?.c ?? 0);
  }
  insert(row: Partial<UserRow>): Promise<unknown> { return this.db('forma_users').insert(row); }
  update(id: string, patch: Partial<UserRow>): Promise<number> { return this.db('forma_users').where({ id }).update(patch); }
  delete(id: string): Promise<number> { return this.db('forma_users').where({ id }).delete(); }

  /** Increment atomik, lalu baca nilai baru. */
  async incrementFailures(id: string): Promise<number> {
    await this.db('forma_users').where({ id }).increment('failed_attempts', 1);
    const r = await this.db('forma_users').where({ id }).first('failed_attempts');
    return Number(r?.failed_attempts ?? 0);
  }
  lock(id: string, until: number): Promise<number> { return this.update(id, { locked_until: until }); }
  recordSuccessfulLogin(id: string, now: number): Promise<number> {
    return this.update(id, { failed_attempts: 0, locked_until: null, last_login_at: now });
  }
  async activeIdsInRoles(roleIds: string[], excludeId?: string): Promise<string[]> {
    if (!roleIds.length) return [];
    const rows = await this.db('forma_users').whereIn('role_id', roleIds).where({ active: true }).select('id');
    return rows.map((r: { id: string }) => r.id).filter((id: string) => id !== excludeId);
  }
  async roleInUse(roleId: string): Promise<boolean> { return !!(await this.db('forma_users').where({ role_id: roleId }).first('id')); }
}
