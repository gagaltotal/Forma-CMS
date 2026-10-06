import type { RoleModel, RoleRow } from '../models/role.model.js';
import { badRequest, conflict, forbidden, isUniqueViolation, notFound } from '../utils/errors.js';
import { isSubset, PERM_RE, PUBLIC_PERM_RE, TOKEN_PERM_RE, type Principal } from '../security/permissions.js';
import { uuid } from '../security/tokens.js';
import { roleBody } from '../validators/role.validator.js';
import { parseWith } from '../validators/parse.js';
import type { AuditService } from './audit.service.js';
import type { SchemaService } from './schema.service.js';
import type { UserModel } from '../models/user.model.js';

export interface RoleView { id: string; name: string; description: string; isSystem: boolean; permissions: string[] }
const toView = (r: RoleRow): RoleView => ({ id: r.id, name: r.name, description: r.description, isSystem: !!r.is_system, permissions: JSON.parse(r.permissions) });

export class RoleService {
  constructor(private roles: RoleModel, private users: UserModel, private schema: SchemaService, private audit: AuditService) {}

  async list(): Promise<RoleView[]> { return (await this.roles.all()).map(toView); }
  async permissionsOf(id: string): Promise<Set<string>> { return new Set(await this.roles.permissionsOf(id)); }

  /** Izin sebuah role tidak boleh melebihi izin pembuatnya, harus valid, dan merujuk tipe konten yang ada. */
  validatePerms(actorPerms: ReadonlySet<string>, perms: string[], opts: { public?: boolean; token?: boolean } = {}): string[] {
    const uniq = [...new Set(perms)];
    for (const p of uniq) {
      if (!PERM_RE.test(p)) throw badRequest(`Unknown permission "${p.slice(0, 60)}"`);
      if (opts.public && !PUBLIC_PERM_RE.test(p)) throw badRequest('The public role can only have read access to content');
      if (opts.token && !TOKEN_PERM_RE.test(p)) throw badRequest('API tokens cannot carry administrative permissions');
      const m = /^content:([a-z0-9_]+):/.exec(p);
      if (m && !this.schema.get(m[1]!)) throw badRequest(`Unknown content type "${m[1]}"`);
    }
    if (!isSubset(uniq, actorPerms)) throw forbidden('You cannot grant permissions you do not have yourself');
    return uniq;
  }

  async create(actor: Principal, raw: unknown): Promise<RoleView> {
    const b = parseWith(roleBody, raw);
    const permissions = this.validatePerms(actor.perms, b.permissions);
    const id = uuid();
    try {
      await this.roles.insert({ id, name: b.name, description: b.description, is_system: false, permissions: JSON.stringify(permissions), created_at: Date.now() });
    } catch (e) { if (isUniqueViolation(e)) throw conflict('A role with this name already exists'); throw e; }
    await this.audit.log('role.create', actor.id, id, actor.ip, { permissions });
    return { id, name: b.name, description: b.description, isSystem: false, permissions };
  }

  async update(actor: Principal, id: string, raw: unknown): Promise<RoleView> {
    const role = await this.roles.find(id);
    if (!role) throw notFound('Role not found');
    if (id === 'admin') throw forbidden('The administrator role cannot be modified');
    // Tidak boleh mengubah role yang lebih berkuasa dari diri sendiri.
    if (!isSubset(JSON.parse(role.permissions), actor.perms)) throw forbidden('This role has permissions you do not have');
    const b = parseWith(roleBody, raw);
    const permissions = this.validatePerms(actor.perms, b.permissions, { public: id === 'public' });
    const patch: Partial<RoleRow> = { permissions: JSON.stringify(permissions) };
    if (!role.is_system) { patch.name = b.name; patch.description = b.description; }
    try { await this.roles.update(id, patch); }
    catch (e) { if (isUniqueViolation(e)) throw conflict('A role with this name already exists'); throw e; }
    // Izin tidak di-cache: perubahan berlaku pada request berikutnya.
    await this.audit.log('role.update', actor.id, id, actor.ip, { permissions });
    return { id, name: role.is_system ? role.name : b.name, description: role.is_system ? role.description : b.description, isSystem: !!role.is_system, permissions };
  }

  async remove(actor: Principal, id: string): Promise<void> {
    const role = await this.roles.find(id);
    if (!role) throw notFound('Role not found');
    if (role.is_system) throw forbidden('System roles cannot be deleted');
    if (await this.users.roleInUse(id)) throw conflict('This role is still assigned to users');
    await this.roles.delete(id);
    await this.audit.log('role.delete', actor.id, id, actor.ip);
  }
}
