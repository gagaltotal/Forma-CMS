import crypto from 'node:crypto';
import type { Config } from '../config/index.js';
import type { SsoStateModel } from '../models/sso-state.model.js';
import type { UserModel } from '../models/user.model.js';
import { verifyJwt } from '../security/oidc.js';
import type { Principal } from '../security/permissions.js';
import { randomToken, safeEqual } from '../security/tokens.js';
import type { AuditService } from './audit.service.js';
import type { AuthService, MeView } from './auth.service.js';
import type { SessionService } from './session.service.js';

type Json = Record<string, unknown>;

const b64url = (buf: Buffer): string => buf.toString('base64url');
const sha256Buffer = (input: string): Buffer => crypto.createHash('sha256').update(input).digest();

/** Titik akhir SSO menuju penyedia identitas. */
export interface SsoStart { url: string; state: string }
/** Hasil callback: sesi Forma yang siap dipasang sebagai cookie. */
export interface SsoResult { user: MeView; token: string; csrf: string; redirectTo: string }
export interface SsoMeta { ip: string | null; userAgent: string }

/**
 * SSO berbasis OIDC (Authorization Code + PKCE). Ciri utama:
 *  - provider-agnostic: konfigurasi cukup dari issuer + client id/secret (discovery otomatis);
 *  - pengguna HARUS sudah terdaftar di Forma CMS (TIDAK ada auto-provision) -> akun tak dikenal ditolak;
 *  - boleh diakses SEMUA role; izin di CMS tetap mengikuti role pengguna;
 *  - ID token beserta tanda tangannya diverifikasi terhadap JWKS milik penyedia.
 */
export class SsoService {
  constructor(
    private cfg: Config,
    private users: UserModel,
    private states: SsoStateModel,
    private sessions: SessionService,
    private auth: AuthService,
    private audit: AuditService,
  ) {}

  get enabled(): boolean { return this.cfg.ssoEnabled; }
  get providerName(): string { return this.cfg.SSO_PROVIDER_NAME; }

  /** Deskripsi publik (tanpa rahasia) untuk UI login. */
  info(): { enabled: boolean; providerName: string; startUrl: string } {
    return { enabled: this.enabled, providerName: this.providerName, startUrl: '/api/auth/sso/start' };
  }

  /** Buat state + PKCE, kembalikan URL authorize penyedia. */
  async start(meta: SsoMeta, redirectTo?: string): Promise<SsoStart> {
    if (!this.enabled) throw new Error('SSO tidak aktif');
    const doc = await this.discovery();
    const state = randomToken(32);
    const nonce = randomToken(16);
    const codeVerifier = randomToken(48);
    const challenge = b64url(sha256Buffer(codeVerifier));
    const now = Date.now();
    await this.states.deleteExpired(now);
    await this.states.insert({
      state,
      code_verifier: codeVerifier,
      nonce,
      redirect_to: this.safeRedirect(redirectTo),
      expires_at: now + this.cfg.SSO_STATE_TTL_MINUTES * 60_000,
      created_at: now,
    });
    const url = new URL(doc.authorization_endpoint as string);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', this.cfg.SSO_CLIENT_ID!);
    url.searchParams.set('redirect_uri', this.cfg.ssoRedirectUri);
    url.searchParams.set('scope', this.cfg.ssoScopes.join(' '));
    url.searchParams.set('state', state);
    url.searchParams.set('nonce', nonce);
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    await this.audit.log('auth.sso_start', null, null, meta.ip);
    return { url: url.toString(), state };
  }

  /**
   * Selesaikan callback: validasi state, tukar code (PKCE), verifikasi ID token,
   * lalu IZINKAN hanya bila email sudah terdaftar sebagai pengguna Forma.
   */
  async complete(meta: SsoMeta, params: { code?: string; state?: string; error?: string; errorDescription?: string }): Promise<SsoResult> {
    if (!this.enabled) throw new Error('SSO tidak aktif');
    if (params.error) throw new Error(params.errorDescription ?? params.error);
    if (!params.code || !params.state) throw new Error('Parameter callback tidak lengkap');

    const rec = await this.states.find(params.state);
    // Sekali-pakai: state langsung dihapus apa pun hasilnya.
    if (rec) await this.states.delete(params.state);
    if (!rec || Number(rec.expires_at) < Date.now()) throw new Error('State SSO tidak valid atau kedaluwarsa');
    if (!safeEqual(rec.state, params.state)) throw new Error('State SSO tidak cocok');

    const doc = await this.discovery();
    const claims = await this.exchange(doc, params.code, rec.code_verifier, rec.nonce);

    // Hanya klaim email yang terverifikasi yang diterima (cegah penyalahgunaan email belum-terverifikasi).
    const emailVerified = claims.email_verified !== false; // absen = dianggap terverifikasi; eksplisit false = tolak
    const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : '';
    if (!email || !emailVerified) throw new Error('Email dari penyedia identitas tidak tersedia atau belum terverifikasi');

    const user = await this.users.findByEmail(email);
    if (!user || !user.active) {
      // Auto-provision SENGAJA dinonaktifkan: akun harus dibuat admin Forma terlebih dahulu.
      await this.audit.log('auth.sso_rejected', null, null, meta.ip, { email });
      throw new Error('Akun belum terdaftar di Forma CMS. Hubungi administrator untuk dibuatkan akun.');
    }

    await this.users.recordSuccessfulLogin(user.id, Date.now());
    const { token, csrf } = await this.sessions.create(user.id, meta.ip, meta.userAgent);
    await this.audit.log('auth.sso_login', user.id, null, meta.ip, { provider: this.providerName });
    return { user: await this.auth.describe(user), token, csrf, redirectTo: rec.redirect_to ?? '/admin/' };
  }

  /** Principal sistem untuk seed konten bawaan (hanya untuk proses internal saat boot). */
  systemPrincipal(apiIds: string[]): Principal {
    const perms = new Set<string>();
    for (const apiId of apiIds) for (const action of ['read', 'create', 'update', 'delete', 'publish', 'drafts']) perms.add(`content:${apiId}:${action}`);
    return { kind: 'user', id: 'system', perms, ip: null };
  }

  /* ---------------- Internal: jaringan ke penyedia OIDC ---------------- */

  private discoveryDoc?: { doc: Json; at: number };

  private async discovery(): Promise<Json> {
    const fresh = this.discoveryDoc && Date.now() - this.discoveryDoc.at < this.discoveryTtl();
    if (this.discoveryDoc && fresh) return this.discoveryDoc.doc;
    const url = new URL('/.well-known/openid-configuration', this.cfg.SSO_ISSUER!).toString();
    const doc = await this.getJson(url);
    for (const k of ['authorization_endpoint', 'token_endpoint', 'jwks_uri'] as const) {
      if (typeof doc[k] !== 'string') throw new Error(`Discovery OIDC kehilangan "${k}"`);
    }
    // Pertahanan SSRF: semua titik akhir harus satu origin dengan issuer (atau host Google untuk userinfo).
    const issuerOrigin = new URL(this.cfg.SSO_ISSUER!).origin;
    const allowed = new Set([issuerOrigin, 'https://accounts.google.com', 'https://openidconnect.googleapis.com', 'https://www.googleapis.com']);
    for (const k of ['authorization_endpoint', 'token_endpoint', 'jwks_uri', 'userinfo_endpoint'] as const) {
      const v = doc[k];
      if (typeof v === 'string' && !allowed.has(new URL(v).origin)) throw new Error(`Titik akhir OIDC "${k}" berada di origin yang tidak tepercaya`);
    }
    this.discoveryDoc = { doc, at: Date.now() };
    return doc;
  }
  private discoveryTtl(): number { return 10 * 60_000; }

  private async exchange(doc: Json, code: string, codeVerifier: string, nonce: string): Promise<Json> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.cfg.ssoRedirectUri,
      client_id: this.cfg.SSO_CLIENT_ID!,
      client_secret: this.cfg.SSO_CLIENT_SECRET!,
      code_verifier: codeVerifier,
    });
    const tokenDoc = await this.postForm(doc.token_endpoint as string, body);
    const idToken = typeof tokenDoc.id_token === 'string' ? tokenDoc.id_token : undefined;
    if (idToken) {
      const jwks = await this.getJson(doc.jwks_uri as string);
      return verifyJwt({ token: idToken, jwks, issuer: this.cfg.SSO_ISSUER!, audience: this.cfg.SSO_CLIENT_ID!, nonce });
    }
    // Fallback: sebagian penyedia tidak mengembalikan id_token -> baca userinfo (endpoint terverifikasi).
    const accessToken = typeof tokenDoc.access_token === 'string' ? tokenDoc.access_token : undefined;
    if (!accessToken || typeof doc.userinfo_endpoint !== 'string') throw new Error('Penyedia tidak mengembalikan ID token');
    return this.getJson(doc.userinfo_endpoint, accessToken);
  }

  private async getJson(url: string, accessToken?: string): Promise<Json> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (accessToken) headers.authorization = `Bearer ${accessToken}`;
    const res = await this.fetchJson(url, { headers });
    return res;
  }

  private async postForm(url: string, body: URLSearchParams): Promise<Json> {
    return this.fetchJson(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body,
    });
  }

  private async fetchJson(url: string, init: RequestInit): Promise<Json> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal, redirect: 'error' });
      const text = await res.text();
      if (!res.ok) throw new Error(`Penyedia identitas menolak permintaan (HTTP ${res.status})`);
      if (text.length > 256 * 1024) throw new Error('Respons penyedia identitas terlalu besar');
      return JSON.parse(text) as Json;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Terima hanya path internal (cegah open-redirect). */
  private safeRedirect(target?: string): string | null {
    if (!target) return null;
    if (!target.startsWith('/') || target.startsWith('//') || target.includes('\\')) return null;
    if (target.startsWith('/api/')) return null;
    return target.slice(0, 300);
  }
}