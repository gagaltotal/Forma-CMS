import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config/index.js';
import type { AppContext } from '../src/core/container.js';
import { hashPassword } from '../src/security/password.js';
import crypto from 'node:crypto';
import pg from 'pg';
import mysql from 'mysql2/promise';
import { uuid } from '../src/security/tokens.js';

export const STRONG = 'Correct-Horse-Battery-9';

/**
 * TEST_DB=sqlite (default) | postgres | mysql. Untuk postgres/mysql set TEST_ADMIN_URL;
 * setiap makeApp() memakai DATABASE baru agar tes saling terisolasi.
 */
async function provisionDb(dir: string): Promise<Record<string, string>> {
  const kind = process.env.TEST_DB ?? 'sqlite';
  if (kind === 'sqlite') return { SQLITE_PATH: path.join(dir, 't.db') };
  const admin = process.env.TEST_ADMIN_URL;
  if (!admin) throw new Error('Set TEST_ADMIN_URL untuk TEST_DB=' + kind);
  const name = `forma_t_${crypto.randomBytes(5).toString('hex')}`;
  const u = new URL(admin);
  if (kind === 'postgres') {
    const c = new pg.Client({ connectionString: admin }); await c.connect(); await c.query(`CREATE DATABASE ${name}`); await c.end();
    u.pathname = `/${name}`;
    return { DB_CLIENT: 'postgres', DATABASE_URL: u.toString() };
  }
  const c = await mysql.createConnection(admin); await c.query(`CREATE DATABASE ${name} CHARACTER SET utf8mb4`); await c.end();
  u.pathname = `/${name}`;
  return { DB_CLIENT: 'mysql', DATABASE_URL: u.toString() };
}

export async function makeApp(env: Record<string, string> = {}): Promise<{ app: FastifyInstance; ctx: AppContext; dir: string }> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forma-'));
  const cfg = loadConfig({
    NODE_ENV: 'test', APP_SECRET: 'a'.repeat(48), UPLOAD_DIR: path.join(dir, 'up'),
    PUBLIC_URL: 'http://127.0.0.1:3000', LOGIN_MAX_PER_15MIN: '100', RATE_LIMIT_PER_MINUTE: '5000',
    ...(await provisionDb(dir)), ...env,
  } as NodeJS.ProcessEnv);
  const { app, ctx } = await buildApp(cfg, { logger: process.env.DBG ? { level: 'error' } : false } as any);
  return { app, ctx, dir };
}

export async function seedUser(ctx: AppContext, email: string, password: string, roleId: string): Promise<string> {
  const id = uuid();
  await ctx.db('forma_users').insert({ id, email, name: email.split('@')[0], password_hash: await hashPassword(password), role_id: roleId, active: true, created_at: Date.now() });
  return id;
}

export interface Res { status: number; json: any; headers: Record<string, any>; raw: string }

export class Client {
  cookie = '';
  csrf = '';
  ua = 'forma-test/1.0';
  constructor(private app: FastifyInstance) {}

  async call(method: string, url: string, body?: unknown, extra: Record<string, string> = {}, raw?: { payload: Buffer; headers: Record<string, string> }): Promise<Res> {
    const headers: Record<string, string> = { 'user-agent': this.ua, ...extra, ...(raw?.headers ?? {}) };
    if (this.cookie) headers.cookie = this.cookie;
    if (this.csrf && method !== 'GET' && !('x-csrf-token' in extra)) headers['x-csrf-token'] = this.csrf;
    const res = await this.app.inject({ method: method as any, url, headers, payload: (raw?.payload ?? body) as any });
    const sc = res.headers['set-cookie'];
    const first = Array.isArray(sc) ? sc[0] : sc;
    if (first) { const kv = first.split(';')[0]!; const [, v] = kv.split('='); this.cookie = v ? kv : ''; }
    let json: any = null;
    try { json = JSON.parse(res.body); } catch { /* bukan JSON */ }
    return { status: res.statusCode, json, headers: res.headers, raw: res.body };
  }
  get = (u: string, h?: Record<string, string>) => this.call('GET', u, undefined, h);
  post = (u: string, b?: unknown, h?: Record<string, string>) => this.call('POST', u, b, h);
  put = (u: string, b?: unknown, h?: Record<string, string>) => this.call('PUT', u, b, h);
  patch = (u: string, b?: unknown, h?: Record<string, string>) => this.call('PATCH', u, b, h);
  del = (u: string, h?: Record<string, string>) => this.call('DELETE', u, undefined, h);

  async login(email: string, password: string): Promise<Res> {
    const r = await this.post('/api/auth/login', { email, password });
    if (r.status === 200) this.csrf = r.json.csrfToken;
    return r;
  }
}

export function multipartBody(filename: string, content: Buffer, mime = 'image/png') {
  const b = `----formaTest${Math.random().toString(16).slice(2)}`;
  const head = Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`);
  const tail = Buffer.from(`\r\n--${b}--\r\n`);
  return { payload: Buffer.concat([head, content, tail]), headers: { 'content-type': `multipart/form-data; boundary=${b}` } };
}

export const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
