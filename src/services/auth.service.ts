import { AUTH } from '../config/constants.js';
import type { RoleModel } from '../models/role.model.js';
import type { UserModel, UserRow } from '../models/user.model.js';
import { checkPasswordStrength, dummyHash, hashPassword, verifyPassword } from '../security/password.js';
import type { RequestMeta } from '../types/http.js';
import { badRequest, HttpError } from '../utils/errors.js';
import type { AuditService } from './audit.service.js';
import type { SessionService } from './session.service.js';
import type { TotpService } from './totp.service.js';

export interface MeView { id: string; email: string; name: string; role: { id?: string; name?: string }; permissions: string[] }

export class AuthService {
  constructor(
    private users: UserModel, private roles: RoleModel, private sessions: SessionService, private audit: AuditService,
    private totp?: TotpService,
  ) {}

  async describe(u: UserRow): Promise<MeView> {
    const role = await this.roles.find(u.role_id);
    return { id: u.id, email: u.email, name: u.name, role: { id: role?.id, name: role?.name }, permissions: await this.roles.permissionsOf(u.role_id) };
  }

  async me(userId: string): Promise<MeView> { return this.describe((await this.users.find(userId))!); }

  async login(
    email: string, password: string, meta: RequestMeta, previousSessionToken?: string, totpCode?: string,
  ): Promise<{ user: MeView; token: string; csrf: string }> {
    const user = await this.users.findByEmail(email);
    const now = Date.now();
    const locked = !!user && user.locked_until != null && Number(user.locked_until) > now;
    // Hash SELALU dihitung (termasuk user tidak ada / terkunci) -> waktu respons seragam (anti user-enumeration & timing).
    const passwordOk = await verifyPassword(password, user?.password_hash ?? (await dummyHash()));

    if (!user || locked || !user.active || !passwordOk) {
      // Lapis 2: lockout per-akun dengan backoff eksponensial (5 gagal -> 15 mnt, 30 mnt, 1 jam, … maks 24 jam)
      if (user && !locked) {
        const n = await this.users.incrementFailures(user.id);
        if (n >= AUTH.MAX_FAILED_LOGINS) {
          await this.users.lock(user.id, now + Math.min(AUTH.BASE_LOCK_MS * 2 ** (n - AUTH.MAX_FAILED_LOGINS), AUTH.MAX_LOCK_MS));
        }
      }
      await this.audit.log('auth.login_failed', user?.id ?? null, null, meta.ip, { locked });
      // Pesan identik untuk semua kegagalan -> tidak membocorkan apakah email terdaftar.
      throw new HttpError(401, 'invalid_credentials', 'Invalid email or password, or the account is temporarily locked');
    }

    // 2FA (TOTP): bila diaktifkan, wajib kode valid. Backup code juga diterima (one-time).
    if (user.totp_enabled && this.totp) {
      const valid = totpCode
        ? ((await this.totp.verify(user.id, totpCode)) || (await this.totp.verifyBackupCode(user.id, totpCode)))
        : false;
      if (!valid) {
        await this.users.incrementFailures(user.id);
        await this.audit.log('auth.login_2fa_failed', user.id, null, meta.ip);
        // code khusus agar klien tahu untuk meminta kode TOTP.
        throw new HttpError(401, 'totp_required', 'Two-factor authentication code required');
      }
    }

    // Rotasi sesi (anti session fixation): sesi lama dibuang, token baru selalu dibuat.
    if (previousSessionToken) await this.sessions.destroyByRawToken(previousSessionToken);
    await this.users.recordSuccessfulLogin(user.id, now);
    const { token, csrf } = await this.sessions.create(user.id, meta.ip, meta.userAgent);
    await this.audit.log('auth.login', user.id, null, meta.ip);
    return { user: await this.describe(user), token, csrf };
  }

  async logout(session: { id: string; userId: string } | null, ip: string | null): Promise<void> {
    if (!session) return;
    await this.sessions.destroy(session.id);
    await this.audit.log('auth.logout', session.userId, null, ip);
  }

  async changePassword(userId: string, current: string, next: string, meta: RequestMeta): Promise<{ token: string; csrf: string }> {
    const u = (await this.users.find(userId))!;
    if (!(await verifyPassword(current, u.password_hash))) {
      await this.audit.log('auth.password_change_failed', u.id, null, meta.ip);
      throw new HttpError(401, 'invalid_credentials', 'Current password is incorrect');
    }
    const weak = checkPasswordStrength(next, u.email);
    if (weak) throw badRequest(weak);
    await this.users.update(u.id, { password_hash: await hashPassword(next) });
    // Semua sesi lama dicabut; sesi baru diterbitkan untuk perangkat ini.
    await this.sessions.destroyAllFor(u.id);
    const created = await this.sessions.create(u.id, meta.ip, meta.userAgent);
    await this.audit.log('auth.password_changed', u.id, null, meta.ip);
    return created;
  }
}
