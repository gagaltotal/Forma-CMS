import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../src/core/container.js';
import { sha256 } from '../src/security/tokens.js';
import { loadConfig } from '../src/config/index.js';
import { Client, makeApp, seedUser, STRONG } from './helpers.js';

let app: FastifyInstance, ctx: AppContext;
before(async () => {
  ({ app, ctx } = await makeApp());
  await seedUser(ctx, 'admin@example.com', STRONG, 'admin');
  await seedUser(ctx, 'victim@example.com', STRONG, 'editor');
});
after(async () => { await app.close(); });

describe('Header & konfigurasi', () => {
  test('halaman publik menampilkan konten dinamis dan /admin tetap login-only', async () => {
    const t = await makeApp();
    try {
      const pageType = await t.ctx.services.schema.create({
        apiId: 'home',
        displayName: 'Home',
        fields: [
          { name: 'header', type: 'text' },
          { name: 'subtitle', type: 'text' },
          { name: 'body', type: 'richtext' },
          { name: 'footer', type: 'text' },
          { name: 'features', type: 'json' },
          { name: 'testimonials', type: 'json' },
        ],
      });
      const principal = { kind: 'user' as const, id: 'seeded-admin', perms: new Set<string>([
        `content:${pageType.apiId}:read`,
        `content:${pageType.apiId}:create`,
        `content:${pageType.apiId}:update`,
        `content:${pageType.apiId}:delete`,
        `content:${pageType.apiId}:publish`,
      ]), ip: '127.0.0.1' };
      await t.ctx.services.content.create(principal, pageType.apiId, {
        status: 'published',
        data: {
          header: 'Selamat datang di Forma',
          subtitle: 'Platform yang membuat tim produk, editorial, dan marketing bisa bergerak cepat.',
          body: '<p>Konten halaman publik dari backend.</p>',
          footer: '© 2026 Forma CMS',
          features: JSON.stringify([
            { title: 'Model cepat', description: 'Membentuk struktur konten tanpa kode berulang.' },
            { title: 'Publish aman', description: 'Draft, review, dan publish dengan kontrol jelas.' },
          ]),
          testimonials: JSON.stringify([
            { quote: 'Kami bisa meluncurkan pengalaman baru dalam satu hari.', name: 'Naila', role: 'Head of Growth' },
          ]),
        },
      });
      const root = await t.app.inject({ method: 'GET', url: '/' });
      assert.equal(root.statusCode, 200);
      assert.match(root.body, /Selamat datang di Forma/);
      assert.match(root.body, /Konten halaman publik dari backend\./);
      assert.match(root.body, /Model cepat/);
      assert.match(root.body, /Kami bisa meluncurkan pengalaman baru dalam satu hari\./);
      assert.match(root.body, /Forma CMS/);
      const admin = await t.app.inject({ method: 'GET', url: '/admin' });
      assert.equal(admin.statusCode, 302);
      assert.equal(admin.headers.location, '/admin/');
    } finally { await t.app.close(); }
  });
  test('header keamanan hadir dan tidak ada X-Powered-By', async () => {
    const r = await new Client(app).get('/api/health');
    assert.match(r.headers['content-security-policy'], /script-src 'self'/);
    assert.match(r.headers['content-security-policy'], /frame-ancestors 'none'/);
    assert.equal(r.headers['x-content-type-options'], 'nosniff');
    assert.equal(r.headers['x-frame-options'], 'DENY');
    assert.equal(r.headers['referrer-policy'], 'no-referrer');
    assert.equal(r.headers['x-powered-by'], undefined);
    assert.equal(r.headers['cache-control'], 'no-store');
  });
  test('JSON rusak / prototype poisoning ditolak tanpa bocor stack trace', async () => {
    const c = new Client(app);
    await c.login('admin@example.com', STRONG);
    const r = await c.call('POST', '/api/admin/roles', undefined, { 'content-type': 'application/json' }, { payload: Buffer.from('{"name":"x","permissions":[],"__proto__":{"admin":true}}'), headers: { 'content-type': 'application/json' } });
    assert.equal(r.status, 400);
    assert.doesNotMatch(r.raw, /at .*\.(ts|js):\d+/);
    const bad = await c.call('POST', '/api/admin/roles', undefined, {}, { payload: Buffer.from('{oops'), headers: { 'content-type': 'application/json' } });
    assert.equal(bad.status, 400);
  });
  test('tipe konten selain JSON/multipart ditolak (415)', async () => {
    const r = await new Client(app).call('POST', '/api/auth/login', undefined, {}, { payload: Buffer.from('email=a&password=b'), headers: { 'content-type': 'application/x-www-form-urlencoded' } });
    assert.equal(r.status, 415);
  });
});

describe('Login, brute force & sesi', () => {
  test('pesan gagal identik untuk email tidak ada vs password salah (anti user-enumeration)', async () => {
    const a = await new Client(app).login('nobody@example.com', 'whatever-123456');
    const b = await new Client(app).login('admin@example.com', 'wrong-password-123');
    assert.equal(a.status, 401); assert.equal(b.status, 401);
    assert.deepEqual(a.json, b.json);
  });

  test('lockout akun setelah 5 gagal: password BENAR pun ditolak', async () => {
    const c = new Client(app);
    for (let i = 0; i < 5; i++) assert.equal((await c.login('victim@example.com', `salah-salah-${i}`)).status, 401);
    const ok = await c.login('victim@example.com', STRONG);
    assert.equal(ok.status, 401, 'akun terkunci harus menolak kredensial benar');
    const row = await ctx.db('forma_users').where({ email: 'victim@example.com' }).first();
    assert.ok(Number(row.locked_until) > Date.now());
  });

  test('cookie sesi: HttpOnly + SameSite=Strict; token tidak disimpan plaintext', async () => {
    const c = new Client(app);
    const raw = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'admin@example.com', password: STRONG }, headers: { 'user-agent': c.ua } });
    assert.equal(raw.statusCode, 200);
    const sc = String(raw.headers['set-cookie']);
    assert.match(sc, /HttpOnly/i); assert.match(sc, /SameSite=Strict/i); assert.match(sc, /Path=\//);
    const token = /forma_sid=([^;]+)/.exec(sc)![1]!;
    assert.equal(await ctx.db('forma_sessions').where({ id: token }).first(), undefined, 'token mentah tidak boleh ada di DB');
    assert.ok(await ctx.db('forma_sessions').where({ id: sha256(token) }).first(), 'hash token harus ada');
  });

  test('session fixation: login selalu menerbitkan token baru', async () => {
    const c = new Client(app);
    await c.login('admin@example.com', STRONG);
    const first = c.cookie;
    await c.login('admin@example.com', STRONG);
    assert.notEqual(c.cookie, first);
    // sesi lama sudah dibuang dan tidak bisa dipakai lagi
    const old = new Client(app); old.cookie = first;
    assert.equal((await old.get('/api/auth/me')).status, 401);
  });

  test('cookie dipalsukan/dimodifikasi -> ditolak', async () => {
    const c = new Client(app);
    await c.login('admin@example.com', STRONG);
    for (const evil of ['forma_sid=AAAA', `forma_sid=${c.cookie.split('=')[1]}x`, `forma_sid=' OR 1=1--`, 'forma_sid=' + 'A'.repeat(43)]) {
      const t = new Client(app); t.cookie = evil;
      assert.equal((await t.get('/api/auth/me')).status, 401, evil);
    }
  });

  test('pembajakan sesi: User-Agent berbeda mematikan sesi', async () => {
    const c = new Client(app);
    await c.login('admin@example.com', STRONG);
    const thief = new Client(app); thief.cookie = c.cookie; thief.ua = 'evil-browser/9';
    assert.equal((await thief.get('/api/auth/me')).status, 401);
    assert.equal((await c.get('/api/auth/me')).status, 401, 'sesi asli juga dicabut setelah indikasi pembajakan');
  });

  test('logout mencabut sesi di server', async () => {
    const c = new Client(app);
    await c.login('admin@example.com', STRONG);
    const stolen = c.cookie;
    assert.equal((await c.post('/api/auth/logout')).status, 200);
    const t = new Client(app); t.cookie = stolen;
    assert.equal((await t.get('/api/auth/me')).status, 401);
  });

  test('sesi idle & absolut kedaluwarsa di sisi server', async () => {
    const c = new Client(app);
    await c.login('admin@example.com', STRONG);
    await ctx.db('forma_sessions').update({ last_seen_at: Date.now() - 3 * 3_600_000 });
    assert.equal((await c.get('/api/auth/me')).status, 401);
    await c.login('admin@example.com', STRONG);
    await ctx.db('forma_sessions').update({ expires_at: Date.now() - 1 });
    assert.equal((await c.get('/api/auth/me')).status, 401);
  });

  test('ganti password mencabut semua sesi lain', async () => {
    const a = new Client(app), b = new Client(app);
    await seedUser(ctx, 'pw@example.com', STRONG, 'editor');
    await a.login('pw@example.com', STRONG); await b.login('pw@example.com', STRONG);
    const r = await a.post('/api/auth/password', { currentPassword: STRONG, newPassword: 'Another-Strong-Pass-77' });
    assert.equal(r.status, 200);
    a.csrf = r.json.csrfToken; // sesi baru = token CSRF baru
    assert.equal((await b.get('/api/auth/me')).status, 401);
    const weak = await a.post('/api/auth/password', { currentPassword: 'Another-Strong-Pass-77', newPassword: 'short' });
    assert.equal(weak.status, 400);
  });
});

describe('CSRF & Origin', () => {
  test('POST dengan cookie tapi tanpa token CSRF -> 403', async () => {
    const c = new Client(app);
    await c.login('admin@example.com', STRONG);
    const r = await c.post('/api/admin/roles', { name: 'NoCsrf', description: '', permissions: [] }, { 'x-csrf-token': 'wrong' });
    assert.equal(r.status, 403); assert.equal(r.json.error.code, 'csrf_failed');
    c.csrf = '';
    assert.equal((await c.post('/api/admin/roles', { name: 'NoCsrf', description: '', permissions: [] })).status, 403);
  });
  test('Origin asing ditolak walau token CSRF benar', async () => {
    const c = new Client(app);
    await c.login('admin@example.com', STRONG);
    const r = await c.post('/api/admin/roles', { name: 'EvilOrigin', description: '', permissions: [] }, { origin: 'https://evil.example' });
    assert.equal(r.status, 403); assert.equal(r.json.error.code, 'bad_origin');
    const login = await new Client(app).post('/api/auth/login', { email: 'admin@example.com', password: STRONG }, { origin: 'https://evil.example' });
    assert.equal(login.status, 403, 'login-CSRF harus ditolak');
    const ok = await c.post('/api/admin/roles', { name: 'GoodOrigin', description: '', permissions: [] }, { origin: 'http://127.0.0.1:3000' });
    assert.equal(ok.status, 201);
  });
  test('CORS: origin tak dikenal tidak mendapat header izin', async () => {
    const r = await app.inject({ method: 'OPTIONS', url: '/api/content/x', headers: { origin: 'https://evil.example', 'access-control-request-method': 'GET' } });
    assert.equal(r.headers['access-control-allow-origin'], undefined);
  });
});

describe('Rate limiting', () => {
  test('login dibatasi per-IP -> 429 + Retry-After', async () => {
    const t = await makeApp({ LOGIN_MAX_PER_15MIN: '3' });
    try {
      const c = new Client(t.app);
      const codes: number[] = [];
      for (let i = 0; i < 5; i++) codes.push((await c.login('x@example.com', 'nope-nope-nope')).status);
      assert.deepEqual(codes, [401, 401, 401, 429, 429]);
      const r = await c.login('x@example.com', 'nope-nope-nope');
      assert.ok(r.headers['retry-after']);
      assert.equal(r.json.error.code, 'rate_limited');
    } finally { await t.app.close(); }
  });
  test('rate limit global API', async () => {
    const t = await makeApp({ RATE_LIMIT_PER_MINUTE: '10' });
    try {
      const c = new Client(t.app);
      let last = 0;
      for (let i = 0; i < 14; i++) last = (await c.get('/api/health')).status;
      assert.equal(last, 429);
    } finally { await t.app.close(); }
  });
});

describe('Konfigurasi production & cookie HTTPS', () => {
  const base = { APP_SECRET: 'k'.repeat(48) };
  test('production menolak PUBLIC_URL http dan APP_SECRET placeholder/pendek', () => {
    assert.throws(() => loadConfig({ ...base, NODE_ENV: 'production', PUBLIC_URL: 'http://cms.example.com' } as any), /https/);
    assert.throws(() => loadConfig({ APP_SECRET: 'change-me-change-me-change-me-change-me', NODE_ENV: 'production', PUBLIC_URL: 'https://cms.example.com' } as any), /placeholder/);
    assert.throws(() => loadConfig({ APP_SECRET: 'pendek', PUBLIC_URL: 'https://cms.example.com' } as any), /APP_SECRET/);
    assert.throws(() => loadConfig({ ...base, DB_CLIENT: 'postgres' } as any), /DATABASE_URL/);
    assert.ok(loadConfig({ ...base, NODE_ENV: 'production', PUBLIC_URL: 'https://cms.example.com' } as any));
  });
  test('https: cookie __Host- + Secure + HttpOnly + SameSite=Strict + tanpa Domain; HSTS aktif', async () => {
    const t = await makeApp({ PUBLIC_URL: 'https://cms.example.com' });
    try {
      await seedUser(t.ctx, 'a@example.com', STRONG, 'admin');
      const r = await t.app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'a@example.com', password: STRONG } });
      const sc = String(r.headers['set-cookie']);
      assert.match(sc, /^__Host-forma_sid=/); assert.match(sc, /Secure/); assert.match(sc, /HttpOnly/); assert.match(sc, /SameSite=Strict/); assert.match(sc, /Path=\//);
      assert.doesNotMatch(sc, /Domain=/i);
      assert.match(String(r.headers['strict-transport-security']), /max-age=31536000/);
      const evil = await t.app.inject({ method: 'POST', url: '/api/auth/login', headers: { origin: 'http://cms.example.com' }, payload: { email: 'a@example.com', password: STRONG } });
      assert.equal(evil.statusCode, 403, 'origin http (downgrade) ditolak');
    } finally { await t.app.close(); }
  });
});

describe('Rate limit allowlist', () => {
  test('IP terpercaya lolos rate limit umum, TAPI login tetap dibatasi', async () => {
    const t = await makeApp({ RATE_LIMIT_PER_MINUTE: '10', RATE_LIMIT_ALLOWLIST: '127.0.0.1', LOGIN_MAX_PER_15MIN: '3' });
    try {
      const c = new Client(t.app);
      for (let i = 0; i < 25; i++) assert.equal((await c.get('/api/health')).status, 200);
      const codes: number[] = [];
      for (let i = 0; i < 5; i++) codes.push((await c.login('x@example.com', 'nope-nope-nope')).status);
      assert.deepEqual(codes, [401, 401, 401, 429, 429]);
    } finally { await t.app.close(); }
  });
});

describe('Audit log tamper-evident', () => {
  test('rantai HMAC valid, lalu rusak jika baris diubah / dihapus', async () => {
    const c = new Client(app);
    await c.login('admin@example.com', STRONG);
    const v1 = await c.get('/api/admin/audit/verify');
    assert.equal(v1.json.ok, true); assert.ok(v1.json.checked > 3);

    const row = await ctx.db('forma_audit').where({ action: 'auth.login' }).first();
    await ctx.db('forma_audit').where({ id: row.id }).update({ action: 'nothing.to.see' });
    const v2 = await c.get('/api/admin/audit/verify');
    assert.equal(v2.json.ok, false); assert.equal(v2.json.brokenAtId, row.id);

    await ctx.db('forma_audit').where({ id: row.id }).update({ action: 'auth.login' });
    assert.equal((await c.get('/api/admin/audit/verify')).json.ok, true);
    await ctx.db('forma_audit').where({ id: row.id }).delete();
    assert.equal((await c.get('/api/admin/audit/verify')).json.ok, false, 'penghapusan baris harus terdeteksi');
  });
});
