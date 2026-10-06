import { badRequest, conflict, forbidden, isUniqueViolation, notFound } from '../utils/errors.js';
import type { RoleModel } from '../models/role.model.js';
import type { UserModel, UserRow, UserWithRole } from '../models/user.model.js';
import { isSubset, type Principal } from '../security/permissions.js';
import { checkPasswordStrength, hashPassword } from '../security/password.js';
import { uuid } from '../security/tokens.js';
import { createUserBody, updateUserBody } from '../validators/user.validator.js';
import { parseWith } from '../validators/parse.js';
import type { AuditService } from './audit.service.js';
import type { SessionService } from './session.service.js';

const toView = (u: UserWithRole) => ({
  id: u.id, email: u.email, name: u.name, roleId: u.role_id, roleName: u.role_name, active: !!u.active,
  locked: u.locked_until != null && Number(u.locked_until) > Date.now(),
  createdAt: Number(u.created_at), lastLoginAt: u.last_login_at == null ? null : Number(u.last_login_at),
});

export class UserService {
  constructor(private users: UserModel, private roles: RoleModel, private sessions: SessionService, private audit: AuditService) {}

  async list() { return (await this.users.listWithRoles()).map(toView); }

  /** Pengguna aktif ber-role super-admin (`*`), tidak termasuk `exclude`. Dipakai agar admin terakhir tak bisa hilang. */
  private async otherSuperAdmins(exclude?: string): Promise<string[]> {
    return this.users.activeIdsInRoles(await this.roles.superAdminIds(), exclude);
  }
  private async rolePerms(roleId: string) { return new Set(await this.roles.permissionsOf(roleId)); }

  async create(actor: Principal, raw: unknown) {
    const b = parseWith(createUserBody, raw);
    const weak = checkPasswordStrength(b.password, b.email);
    if (weak) throw badRequest(weak);
    const perms = await this.rolePerms(b.roleId);
    if (!(await this.roles.exists(b.roleId))) throw badRequest('Unknown role');
    if (!isSubset(perms, actor.perms)) throw forbidden('You cannot assign a role more powerful than your own');
    const id = uuid();
    try {
      await this.users.insert({ id, email: b.email, name: b.name, password_hash: await hashPassword(b.password), role_id: b.roleId, active: true, created_at: Date.now() });
    } catch (e) { if (isUniqueViolation(e)) throw conflict('This email is already registered'); throw e; }
    await this.audit.log('user.create', actor.id, id, actor.ip, { role: b.roleId });
    return { id, email: b.email, name: b.name, roleId: b.roleId, active: true };
  }

  async update(actor: Principal, id: string, raw: unknown): Promise<void> {
    const b = parseWith(updateUserBody, raw);
    const target = await this.users.find(id);
    if (!target) throw notFound('User not found');
    const self = id === actor.id;
    if (!isSubset(await this.rolePerms(target.role_id), actor.perms)) throw forbidden('You cannot modify a user more powerful than yourself');
    if (self && (b.roleId !== undefined || b.active !== undefined)) throw forbidden('You cannot change your own role or status');

    const patch: Partial<UserRow> = {};
    let revoke = false;
    if (b.name !== undefined) patch.name = b.name;
    if (b.roleId !== undefined && b.roleId !== target.role_id) {
      if (!(await this.roles.exists(b.roleId))) throw badRequest('Unknown role');
      if (!isSubset(await this.rolePerms(b.roleId), actor.perms)) throw forbidden('You cannot assign a role more powerful than your own');
      patch.role_id = b.roleId; revoke = true;
    }
    if (b.active !== undefined && b.active !== !!target.active) { patch.active = b.active; revoke = true; }
    if (b.password !== undefined) {
      const weak = checkPasswordStrength(b.password, target.email);
      if (weak) throw badRequest(weak);
      patch.password_hash = await hashPassword(b.password); revoke = true;
    }
    if (b.unlock || b.password !== undefined) { patch.failed_attempts = 0; patch.locked_until = null; }

    // Jangan sampai sistem kehilangan administrator terakhir.
    const wasSuper = (await this.rolePerms(target.role_id)).has('*') && !!target.active;
    const willBeSuper = (await this.rolePerms(patch.role_id ?? target.role_id)).has('*') && (patch.active ?? !!target.active);
    if (wasSuper && !willBeSuper && (await this.otherSuperAdmins(id)).length === 0) throw conflict('At least one active administrator is required');

    if (Object.keys(patch).length) await this.users.update(id, patch);
    if (revoke) await this.sessions.destroyAllFor(id);
    await this.audit.log('user.update', actor.id, id, actor.ip, { fields: Object.keys(patch).filter((k) => k !== 'password_hash') });
  }

  async remove(actor: Principal, id: string): Promise<void> {
    if (id === actor.id) throw forbidden('You cannot delete your own account');
    const target = await this.users.find(id);
    if (!target) throw notFound('User not found');
    const perms = await this.rolePerms(target.role_id);
    if (!isSubset(perms, actor.perms)) throw forbidden('You cannot delete a user more powerful than yourself');
    if (perms.has('*') && (await this.otherSuperAdmins(id)).length === 0) throw conflict('At least one active administrator is required');
    await this.users.delete(id);
    await this.audit.log('user.delete', actor.id, id, actor.ip);
  }
}
