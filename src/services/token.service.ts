import { AUTH } from '../config/constants.js';
import type { ApiTokenModel } from '../models/api-token.model.js';
import type { RoleModel } from '../models/role.model.js';
import { TOKEN_PERM_RE, type Principal } from '../security/permissions.js';
import { randomToken, sha256, uuid } from '../security/tokens.js';
import { badRequest, notFound, unauthorized } from '../utils/errors.js';
import { createTokenBody } from '../validators/token.validator.js';
import { parseWith } from '../validators/parse.js';
import type { AuditService } from './audit.service.js';
import type { RoleService } from './role.service.js';

const BEARER_RE = /^Bearer (fma_[A-Za-z0-9_-]{43})$/;

export class ApiTokenService {
  constructor(private tokens: ApiTokenModel, private roles: RoleModel, private roleService: RoleService, private audit: AuditService) {}

  /** Mengubah header `Authorization: Bearer fma_…` menjadi identitas token. Melempar 401 jika tidak valid. */
  async authenticate(authorization: string): Promise<{ id: string; perms: Set<string> }> {
    const m = BEARER_RE.exec(authorization);
    if (!m) throw unauthorized('Invalid API token');
    const row = await this.tokens.findByHash(sha256(m[1]!));
    if (!row || (row.expires_at != null && Number(row.expires_at) < Date.now())) throw unauthorized('Invalid or expired API token');
    // Defense-in-depth: token tidak pernah membawa izin administrasi, apa pun isi role-nya.
    const perms = new Set((await this.roles.permissionsOf(row.role_id)).filter((p) => TOKEN_PERM_RE.test(p)));
    if (!row.last_used_at || Date.now() - Number(row.last_used_at) > AUTH.SESSION_TOUCH_INTERVAL_MS) {
      void this.tokens.touch(row.id, Date.now()).catch(() => undefined);
    }
    return { id: row.id, perms };
  }

  async list() {
    return (await this.tokens.listWithRoles()).map((t) => ({
      id: t.id, name: t.name, prefix: t.token_prefix, roleId: t.role_id, roleName: t.role_name,
      expiresAt: t.expires_at == null ? null : Number(t.expires_at), lastUsedAt: t.last_used_at == null ? null : Number(t.last_used_at), createdAt: Number(t.created_at),
    }));
  }

  async create(actor: Principal, raw: unknown) {
    const b = parseWith(createTokenBody, raw);
    if (!(await this.roles.exists(b.roleId))) throw badRequest('Unknown role');
    this.roleService.validatePerms(actor.perms, await this.roles.permissionsOf(b.roleId), { token: true });
    const token = `fma_${randomToken(32)}`;
    const id = uuid();
    await this.tokens.insert({
      id, name: b.name, token_hash: sha256(token), token_prefix: token.slice(0, 8), role_id: b.roleId, created_by: actor.id,
      expires_at: b.expiresInDays ? Date.now() + b.expiresInDays * 86_400_000 : null, last_used_at: null, created_at: Date.now(),
    });
    await this.audit.log('token.create', actor.id, id, actor.ip, { role: b.roleId });
    // Token hanya ditampilkan SEKALI; di database hanya tersimpan hash-nya.
    return { id, name: b.name, token };
  }

  async revoke(actor: Principal, id: string): Promise<void> {
    if (!(await this.tokens.delete(id))) throw notFound('Token not found');
    await this.audit.log('token.revoke', actor.id, id, actor.ip);
  }
}
