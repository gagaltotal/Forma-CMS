import type { Config } from '../config/index.js';
import { AUTH } from '../config/constants.js';
import type { SessionModel } from '../models/session.model.js';
import type { UserModel, UserRow } from '../models/user.model.js';
import { randomToken, safeEqual, sha256 } from '../security/tokens.js';
import type { AuditService } from './audit.service.js';

const SID_RE = /^[A-Za-z0-9_-]{43}$/;

export interface ResolvedSession { session: { id: string; userId: string; csrf: string }; user: UserRow }

/** Siklus hidup sesi server-side. Token mentah tidak pernah disimpan; hanya hash SHA-256-nya. */
export class SessionService {
  constructor(private cfg: Config, private sessions: SessionModel, private users: UserModel, private audit: AuditService) {}

  async create(userId: string, ip: string | null, userAgent: string): Promise<{ token: string; csrf: string }> {
    const token = randomToken(32), csrf = randomToken(24), now = Date.now();
    await this.sessions.deleteExpired(now); // housekeeping
    await this.sessions.trimOldest(userId, AUTH.MAX_SESSIONS_PER_USER);
    await this.sessions.insert({
      id: sha256(token), user_id: userId, csrf_token: csrf, created_at: now, last_seen_at: now,
      expires_at: now + this.cfg.SESSION_MAX_HOURS * 3_600_000, ip, ua_hash: sha256(userAgent),
    });
    return { token, csrf };
  }

  /** Validasi cookie: bentuk token, idle/absolute timeout, kecocokan User-Agent, status akun. */
  async resolve(rawToken: string, userAgent: string, ip: string | null): Promise<ResolvedSession | null> {
    if (!SID_RE.test(rawToken)) return null;
    const sid = sha256(rawToken);
    const s = await this.sessions.find(sid);
    if (!s) return null;

    const now = Date.now();
    const idle = now - Number(s.last_seen_at) > this.cfg.SESSION_IDLE_MINUTES * 60_000;
    const expired = Number(s.expires_at) < now;
    const uaMismatch = !safeEqual(s.ua_hash, sha256(userAgent));
    if (idle || expired || uaMismatch) {
      await this.sessions.delete(sid);
      if (uaMismatch) await this.audit.log('session.hijack_suspected', s.user_id, null, ip);
      return null;
    }
    const user = await this.users.find(s.user_id);
    if (!user?.active) { await this.sessions.delete(sid); return null; }
    if (now - Number(s.last_seen_at) > AUTH.SESSION_TOUCH_INTERVAL_MS) void this.sessions.touch(sid, now).catch(() => undefined);
    return { session: { id: sid, userId: user.id, csrf: s.csrf_token }, user };
  }

  destroy(sessionId: string): Promise<number> { return this.sessions.delete(sessionId); }
  destroyByRawToken(raw: string): Promise<number> { return this.sessions.delete(sha256(raw)); }
  destroyAllFor(userId: string): Promise<number> { return this.sessions.deleteByUser(userId); }
}
