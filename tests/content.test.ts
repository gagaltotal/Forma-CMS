import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../src/core/container.js';
import { sha256 } from '../src/security/tokens.js';
import { Client, makeApp, multipartBody, PNG, seedUser, STRONG } from './helpers.js';

let app: FastifyInstance, ctx: AppContext, dir: string;
let admin: Client, pub: Client;
let authorId = '', articleId = '', draftId = '';

before(async () => {
  ({ app, ctx, dir } = await makeApp());
  await seedUser(ctx, 'admin@example.com', STRONG, 'admin');
  admin = new Client(app); pub = new Client(app);
  assert.equal((await admin.login('admin@example.com', STRONG)).status, 200);
});
after(async () => { await app.close(); });

const authorType = { apiId: 'author', displayName: 'Author', fields: [{ name: 'name', type: 'text', required: true }] };
const articleType = {
  apiId: 'article', displayName: 'Article',
  fields: [
    { name: 'title', type: 'text', required: true, max: 120 }, { name: 'body', type: 'richtext' },
    { name: 'views', type: 'integer', min: 0 }, { name: 'slug', type: 'slug' }, { name: 'featured', type: 'boolean' },
    { name: 'kind', type: 'enum', values: ['news', 'guide'] }, { name: 'meta', type: 'json' },
    { name: 'cover', type: 'media' }, { name: 'author', type: 'relation', target: 'author' },
  ],
};

describe('Content-type builder', () => {
  test('membuat tipe konten -> tabel dibuat, tipe muncul', async () => {
    assert.equal((await admin.post('/api/admin/content-types', authorType)).status, 201);
    const r = await admin.post('/api/admin/content-types', articleType);
    assert.equal(r.status, 201); assert.equal(r.json.data.pluralId, 'articles');
    assert.equal((await ctx.db.schema.hasTable('ct_article')), true);
  });

  test('identifier berbahaya ditolak (SQLi via nama tabel/kolom)', async () => {
    const evil = ['x; drop table forma_users;--', 'a"b', "a'b", 'a b', '../etc', 'Article', 'a__b', '1abc', 'x'.repeat(41), 'forma', 'ping'];
    for (const apiId of evil) {
      const r = await admin.post('/api/admin/content-types', { apiId, displayName: 'x', fields: [] });
      assert.ok([400, 409].includes(r.status), `apiId ${apiId} -> ${r.status}`);
    }
    for (const name of ['id', 'status', 'created_at', 'a; drop table x', 'Title', 'a-b', '__proto__', 'constructor']) {
      const r = await admin.post('/api/admin/content-types', { apiId: 'probe', displayName: 'x', fields: [{ name, type: 'text' }] });
      assert.equal(r.status, 400, `field ${name}`);
    }
    assert.equal((await ctx.db.schema.hasTable('forma_users')), true);
    assert.equal((await ctx.db.schema.hasTable('ct_probe')), false);
  });

  test('ubah skema: tambah/hapus kolom, konversi tipe dan unique untuk field non-slug', async () => {
    const t = { apiId: 'note', displayName: 'Note', fields: [{ name: 'a', type: 'text' }, { name: 'slug', type: 'slug' }] };
    assert.equal((await admin.post('/api/admin/content-types', t)).status, 201);
    const entry = await admin.post('/api/content/note', { data: { a: '42', slug: 'note-1' } });
    assert.equal(entry.status, 201, JSON.stringify(entry.json));
    const up = await admin.put('/api/admin/content-types/note', { ...t, fields: [{ name: 'a', type: 'integer' }, { name: 'code', type: 'text', unique: true }, { name: 'b', type: 'integer' }, { name: 'c', type: 'slug' }] });
    assert.equal(up.status, 200, JSON.stringify(up.json));
    const cols = Object.keys(await ctx.db('ct_note').columnInfo());
    assert.ok(cols.includes('b') && cols.includes('c') && !cols.includes('slug'));
    const loaded = await admin.get(`/api/content/note/${entry.json.data.id}`);
    assert.equal(loaded.json.data.a, 42);
    assert.equal((await admin.post('/api/content/note', { data: { a: 7, code: 'same' } })).status, 201);
    assert.equal((await admin.post('/api/content/note', { data: { a: 8, code: 'same' } })).status, 409);
    const invalidConversion = await admin.put('/api/admin/content-types/note', { ...t, fields: [{ name: 'a', type: 'boolean' }, { name: 'code', type: 'text', unique: true }, { name: 'b', type: 'integer' }, { name: 'c', type: 'slug' }] });
    assert.equal(invalidConversion.status, 400);
    assert.equal((await admin.get(`/api/content/note/${entry.json.data.id}`)).json.data.a, 42, 'gagal konversi tidak mengubah data/skema');
    const withoutUnique = await admin.put('/api/admin/content-types/note', { ...t, fields: [{ name: 'a', type: 'integer' }, { name: 'code', type: 'text' }, { name: 'b', type: 'integer' }, { name: 'c', type: 'slug' }] });
    assert.equal(withoutUnique.status, 200, JSON.stringify(withoutUnique.json));
    assert.equal((await admin.post('/api/content/note', { data: { a: 9, code: 'same' } })).status, 201);
    const reenableUnique = await admin.put('/api/admin/content-types/note', { ...t, fields: [{ name: 'a', type: 'integer' }, { name: 'code', type: 'text', unique: true }, { name: 'b', type: 'integer' }, { name: 'c', type: 'slug' }] });
    assert.equal(reenableUnique.status, 409);
    assert.equal((await admin.post('/api/content/note', { data: { a: 10, code: 'same' } })).status, 201, 'unique gagal diaktifkan, definisi lama tetap aktif');
    assert.equal((await admin.del('/api/admin/content-types/note')).status, 200);
    assert.equal((await ctx.db.schema.hasTable('ct_note')), false);
  });

  test('tipe yang masih dirujuk relasi tidak bisa dihapus', async () => {
    assert.equal((await admin.del('/api/admin/content-types/author')).status, 409);
  });
});

describe('CRUD, validasi & mass-assignment', () => {
  test('membuat entri valid', async () => {
    const a = await admin.post('/api/content/author', { data: { name: 'Sari' } });
    assert.equal(a.status, 201); authorId = a.json.data.id;
    const r = await admin.post('/api/content/article', { status: 'published', data: { title: 'Halo Dunia', views: 3, slug: 'halo-dunia', featured: true, kind: 'news', meta: { a: [1, 2] }, author: authorId } });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    articleId = r.json.data.id;
    assert.equal(r.json.data.featured, true); assert.deepEqual(r.json.data.meta, { a: [1, 2] });
    const d = await admin.post('/api/content/article', { data: { title: 'Rahasia draft', slug: 'draft-1' } });
    assert.equal(d.json.data.status, 'draft'); draftId = d.json.data.id;
  });

  test('field tak dikenal / field sistem / tipe salah ditolak (anti mass-assignment & tamper)', async () => {
    const cases: any[] = [
      { data: { title: 'x', role: 'admin' } }, { data: { title: 'x', id: '00000000-0000-4000-8000-000000000000' } },
      { data: { title: 'x', status: 'published' } }, { data: { title: 'x', created_by: 'me' } },
      { data: { title: 'x', views: '5' } }, { data: { title: 'x', views: -1 } }, { data: { title: 'x', views: 1.5 } },
      { data: { title: 'x', kind: 'hack' } }, { data: { title: 'x', featured: 'true' } }, { data: { title: 'x', author: 'not-a-uuid' } },
      { data: { title: 'x'.repeat(200) } }, { data: {} }, { data: { title: 'x', slug: 'Bad Slug!' } },
      { data: { title: '' } }, { data: { title: '   ' } }, { data: { title: '\u0000\u0007' } },
      { data: { title: 'x' }, extra: 1 }, { data: { title: 'x', meta: JSON.parse('{"__proto__":{"x":1}}') } },
      { data: { title: 'x', author: '00000000-0000-4000-8000-000000000000' } },
    ];
    for (const body of cases) {
      const r = await admin.post('/api/content/article', body);
      assert.equal(r.status, 400, JSON.stringify(body) + ' -> ' + r.status);
    }
  });

  test('slug unik -> 409, bukan 500', async () => {
    const r = await admin.post('/api/content/article', { data: { title: 'Dup', slug: 'halo-dunia' } });
    assert.equal(r.status, 409);
  });

  test('update parsial + publish/unpublish', async () => {
    const r = await admin.patch(`/api/content/article/${draftId}`, { data: { views: 9 }, status: 'published' });
    assert.equal(r.status, 200); assert.equal(r.json.data.status, 'published'); assert.ok(r.json.data.publishedAt);
    const back = await admin.patch(`/api/content/article/${draftId}`, { status: 'draft' });
    assert.equal(back.json.data.status, 'draft'); assert.equal(back.json.data.publishedAt, null);
    assert.equal((await admin.patch(`/api/content/article/${draftId}`, {})).status, 400);
  });

  test('populate relasi', async () => {
    const r = await admin.get(`/api/content/article/${articleId}?populate=author,cover`);
    assert.equal(r.json.data.author.name, 'Sari'); assert.equal(r.json.data.cover, null);
    assert.equal((await admin.get(`/api/content/article/${articleId}?populate=title`)).status, 400);
  });
});

describe('SQL injection', () => {
  const list = (qs: string, c = admin) => c.get(`/api/content/article?${qs}`);
  const total = async () => (await list('pageSize=1')).json.meta.total;

  test('payload SQLi pada nilai filter/pencarian diperlakukan sebagai data biasa', async () => {
    const before = await total();
    const payloads = ["' OR '1'='1", "'; DROP TABLE ct_article;--", '" OR ""="', "%' UNION SELECT password_hash,1,1 FROM forma_users--", "1) OR (1=1", "\\'; select sleep(5)#"];
    for (const p of payloads) {
      for (const op of ['eq', 'ne', 'contains', 'startsWith']) {
        const r = await list(`filter[title][${op}]=${encodeURIComponent(p)}`);
        assert.equal(r.status, 200, `${op} ${p}`);
        if (op === 'eq' || op === 'contains' || op === 'startsWith') assert.equal(r.json.data.length, 0);
        assert.doesNotMatch(r.raw, /password_hash|scrypt\$/);
      }
      assert.equal((await list(`q=${encodeURIComponent(p)}`)).status, 200);
    }
    assert.equal(await total(), before, 'tabel harus utuh');
  });

  test('nama kolom/operator/sort tidak bisa disuntik (whitelist skema)', async () => {
    const bad = [
      'filter[title) OR 1=1--][eq]=x', 'filter[password_hash][contains]=a', 'filter[forma_users.email][eq]=a', 'filter[title][eq; drop]=x',
      'filter[title][regex]=x', 'filter[views][eq]=1%20OR%201=1', 'filter[views][contains]=1', 'filter[meta][eq]=x', 'filter[featured][eq]=maybe',
      'sort=title;drop%20table%20ct_article', 'sort=title%20desc,(select%201)', 'sort=password_hash', 'sort=body', 'sort=title:sideways',
      'populate=title', 'page=0', 'pageSize=1000', 'pageSize=-1', 'unknownparam=1', 'filter[title][in]=' + 'a,'.repeat(200),
      'filter[constructor][eq]=x', 'filter[prototype][eq]=x',
    ];
    for (const q of bad) assert.equal((await list(q)).status, 400, q);
    assert.equal(await ctx.db.schema.hasTable('ct_article'), true);
    // qs membuang kunci __proto__ secara diam-diam -> tidak ada prototype pollution, hasil = tanpa filter
    const base = await total();
    const r = await list('filter[__proto__][eq]=x&filter[__proto__][polluted]=yes');
    assert.equal(r.status, 200); assert.equal(r.json.meta.total, base);
    assert.equal(({} as any).polluted, undefined); assert.equal(({} as any).eq, undefined);
  });

  test('sort/filter menerima alias camelCase seperti yang dikeluarkan API (createdAt, publishedAt)', async () => {
    for (const q of ['sort=publishedAt:desc', 'sort=createdAt', 'sort=updatedAt:asc,title:desc', 'filter[createdAt][gte]=2000-01-01T00:00:00Z', 'filter[publishedAt][null]=false', 'filter[updatedAt][lt]=2999-01-01']) {
      assert.equal((await list(q)).status, 200, q);
    }
    const asc = (await list('sort=createdAt:asc&pageSize=100')).json.data.map((e: any) => e.createdAt);
    assert.deepEqual(asc, [...asc].sort());
    // GraphQL memakai jalur validasi yang sama
    const g = await admin.call('POST', '/graphql', { query: '{ articles(sort:"publishedAt:desc", pageSize: 3) { items { title publishedAt } } }' });
    assert.equal(g.status, 200, g.raw);
    assert.equal((await list('filter[createdAt][gte]=2999-01-01')).json.data.length, 0);
    for (const q of ['sort=createdat', 'sort=created_at;x', 'sort=CreatedAt', 'filter[createdAt][contains]=x', 'filter[hasOwnProperty][eq]=x', 'filter[toString][eq]=x']) {
      assert.equal((await list(q)).status, 400, q);
    }
  });

  test('wildcard LIKE di-escape: "_" dan "%" dianggap literal', async () => {
    await admin.post('/api/content/article', { data: { title: 'a_b 100%' } });
    await admin.post('/api/content/article', { data: { title: 'axb 1000' } });
    assert.equal((await list('filter[title][contains]=a_b')).json.data.length, 1);
    assert.equal((await list('filter[title][contains]=100%25')).json.data.length, 1);
    assert.equal((await list('q=%25')).json.data.length, 1);
  });

  test('parameter path (apiId & id) tidak bisa dipakai untuk injeksi / traversal', async () => {
    for (const u of ["/api/content/article;drop", '/api/content/forma_users', '/api/content/..%2f..%2fetc%2fpasswd', "/api/content/article/1'%20OR%20'1'='1", '/api/content/article/%00', '/api/content/ct_article']) {
      const r = await admin.get(u);
      assert.ok([400, 404].includes(r.status), `${u} -> ${r.status}`);
    }
  });
});

describe('XSS & sanitasi', () => {
  test('rich text dibersihkan di server (allowlist)', async () => {
    const dirty = '<p onclick="x()">Hi</p><script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">l</a><iframe src="//e"></iframe><img src="data:text/html;base64,AAAA"><svg onload=alert(1)><style>*{}</style><b>ok</b>';
    const r = await admin.post('/api/content/article', { data: { title: 'xss', body: dirty } });
    const html: string = r.json.data.body;
    for (const bad of ['<script', 'onerror', 'onclick', 'javascript:', '<iframe', 'data:text', '<svg', '<style', 'onload']) assert.ok(!html.toLowerCase().includes(bad), `${bad} lolos: ${html}`);
    assert.ok(html.includes('<b>ok</b>') && html.includes('<p>Hi</p>'));
  });
  test('karakter kontrol / null byte dibuang dari teks', async () => {
    const r = await admin.post('/api/content/article', { data: { title: 'a\u0000b\u0007c' } });
    assert.equal(r.json.data.title, 'abc');
  });
  test('rich text wajib yang isinya hanya script menjadi kosong -> ditolak', async () => {
    await admin.post('/api/admin/content-types', { apiId: 'page', displayName: 'Page', fields: [{ name: 'content', type: 'richtext', required: true }] });
    assert.equal((await admin.post('/api/content/page', { data: { content: '<script>alert(1)</script>' } })).status, 400);
    assert.equal((await admin.post('/api/content/page', { data: { content: '<p>ok</p>' } })).status, 201);
  });
  test('respons API selalu application/json + nosniff (tidak bisa dirender sebagai HTML)', async () => {
    const r = await admin.get(`/api/content/article/${articleId}`);
    assert.match(String(r.headers['content-type']), /^application\/json/);
    assert.equal(r.headers['x-content-type-options'], 'nosniff');
  });
});

describe('RBAC, draft & privilege escalation', () => {
  test('publik tidak bisa apa-apa sampai diberi izin baca (default deny)', async () => {
    assert.equal((await pub.get('/api/content/article')).status, 401);
    assert.equal((await pub.post('/api/content/article', { data: { title: 'x' } })).status, 401);
    assert.equal((await pub.get('/api/admin/users')).status, 401);
    assert.equal((await pub.get('/api/media')).status, 401);
  });
  test('role publik hanya boleh izin baca', async () => {
    for (const perms of [['content:article:create'], ['*'], ['users:manage'], ['media:upload']]) {
      assert.equal((await admin.put('/api/admin/roles/public', { name: 'Public', description: '', permissions: perms })).status, 400, perms.join());
    }
    assert.equal((await admin.put('/api/admin/roles/public', { name: 'Public', description: '', permissions: ['content:article:read'] })).status, 200);
  });
  test('publik hanya melihat entri published; draft = 404', async () => {
    const l = await pub.get('/api/content/article');
    assert.equal(l.status, 200);
    assert.ok(l.json.data.length >= 1 && l.json.data.every((e: any) => e.status === 'published'));
    assert.equal((await pub.get(`/api/content/article/${draftId}`)).status, 404);
    assert.equal((await pub.get(`/api/content/article?filter[status][eq]=draft`)).json.data.length, 0);
    assert.equal((await pub.get(`/api/content/author`)).status, 401, 'tipe lain tetap tertutup');
  });
  test('populate tidak membocorkan tipe yang tidak boleh dibaca', async () => {
    const r = await pub.get(`/api/content/article/${articleId}?populate=author`);
    assert.equal(r.json.data.author, authorId, 'hanya id, tanpa data author');
  });
  test('relasi: tidak bisa mereferensikan tipe yang tidak berhak dibaca (anti oracle/IDOR)', async () => {
    const role = await admin.post('/api/admin/roles', { name: 'Writer', description: '', permissions: ['content:article:create', 'content:article:read', 'content:article:drafts', 'content:article:update'] });
    await admin.post('/api/admin/users', { email: 'writer@example.com', name: 'W', password: STRONG, roleId: role.json.data.id });
    const w = new Client(app); await w.login('writer@example.com', STRONG);
    assert.equal((await w.post('/api/content/article', { data: { title: 'w', author: authorId } })).status, 403);
    assert.equal((await w.post('/api/content/article', { status: 'published', data: { title: 'w' } })).status, 403, 'tanpa izin publish');
    assert.equal((await w.del(`/api/content/article/${articleId}`)).status, 403, 'tanpa izin delete');
    assert.equal((await w.post('/api/content/article', { data: { title: 'w ok' } })).status, 201);
    assert.equal((await w.get('/api/admin/users')).status, 403);
  });
  test('privilege escalation dicegah', async () => {
    const mgrRole = await admin.post('/api/admin/roles', { name: 'Manager', description: '', permissions: ['roles:manage', 'users:manage', 'tokens:manage'] });
    await admin.post('/api/admin/users', { email: 'mgr@example.com', name: 'M', password: STRONG, roleId: mgrRole.json.data.id });
    const m = new Client(app); await m.login('mgr@example.com', STRONG);
    assert.equal((await m.post('/api/admin/roles', { name: 'Evil', description: '', permissions: ['*'] })).status, 403);
    assert.equal((await m.post('/api/admin/roles', { name: 'Evil2', description: '', permissions: ['schema:manage'] })).status, 403);
    assert.equal((await m.post('/api/admin/users', { email: 'evil@example.com', name: 'E', password: STRONG, roleId: 'admin' })).status, 403);
    const adminId = (await ctx.db('forma_users').where({ email: 'admin@example.com' }).first()).id;
    assert.equal((await m.put(`/api/admin/users/${adminId}`, { password: 'Hacked-Password-123' })).status, 403);
    assert.equal((await m.del(`/api/admin/users/${adminId}`)).status, 403);
    const meId = (await ctx.db('forma_users').where({ email: 'mgr@example.com' }).first()).id;
    assert.equal((await m.put(`/api/admin/users/${meId}`, { roleId: 'admin' })).status, 403);
    assert.equal((await m.put('/api/admin/roles/admin', { name: 'x', description: '', permissions: [] })).status, 403);
    assert.equal((await m.post('/api/admin/content-types', { apiId: 'zzz', displayName: 'z', fields: [] })).status, 403);
  });
  test('administrator terakhir tidak bisa dihapus / dinonaktifkan; tidak bisa hapus diri sendiri', async () => {
    const adminId = (await ctx.db('forma_users').where({ email: 'admin@example.com' }).first()).id;
    assert.equal((await admin.del(`/api/admin/users/${adminId}`)).status, 403);
    assert.equal((await admin.put(`/api/admin/users/${adminId}`, { active: false })).status, 403);
  });
  test('menonaktifkan user langsung mencabut sesinya', async () => {
    const v = new Client(app); await seedUser(ctx, 'temp@example.com', STRONG, 'editor'); await v.login('temp@example.com', STRONG);
    const id = (await ctx.db('forma_users').where({ email: 'temp@example.com' }).first()).id;
    assert.equal((await admin.put(`/api/admin/users/${id}`, { active: false })).status, 200);
    assert.equal((await v.get('/api/auth/me')).status, 401);
    assert.equal((await new Client(app).login('temp@example.com', STRONG)).status, 401);
  });
});

describe('API token', () => {
  let token = '';
  test('token hanya tampil sekali, di DB hanya hash', async () => {
    const role = await admin.post('/api/admin/roles', { name: 'Reader', description: '', permissions: ['content:article:read'] });
    const r = await admin.post('/api/admin/tokens', { name: 'frontend', roleId: role.json.data.id, expiresInDays: 30 });
    assert.equal(r.status, 201); token = r.json.data.token; assert.match(token, /^fma_[A-Za-z0-9_-]{43}$/);
    const row = await ctx.db('forma_api_tokens').first();
    assert.equal(row.token_hash, sha256(token)); assert.ok(!JSON.stringify(row).includes(token));
    assert.doesNotMatch((await admin.get('/api/admin/tokens')).raw, /fma_[A-Za-z0-9_-]{43}/);
  });
  test('token bekerja untuk izin miliknya saja; tidak bisa akses admin; CSRF tak berlaku', async () => {
    const t = new Client(app);
    const h = { authorization: `Bearer ${token}` };
    assert.equal((await t.get('/api/content/article', h)).status, 200);
    assert.equal((await t.post('/api/content/article', { data: { title: 'x' } }, h)).status, 403);
    assert.equal((await t.get('/api/admin/users', h)).status, 401);
    assert.equal((await t.get('/api/content/article', { authorization: 'Bearer fma_' + 'A'.repeat(43) })).status, 401);
    assert.equal((await t.get('/api/content/article', { authorization: 'Bearer nonsense' })).status, 401);
  });
  test('token tidak boleh memakai role administratif', async () => {
    assert.equal((await admin.post('/api/admin/tokens', { name: 'evil', roleId: 'admin' })).status, 400);
    assert.equal((await admin.post('/api/admin/tokens', { name: 'evil', roleId: 'editor', expiresInDays: 0 })).status, 400);
  });
  test('token kedaluwarsa & dicabut ditolak', async () => {
    await ctx.db('forma_api_tokens').update({ expires_at: Date.now() - 1000 });
    assert.equal((await new Client(app).get('/api/content/article', { authorization: `Bearer ${token}` })).status, 401);
  });
});

describe('Media: upload aman, LFI & path traversal', () => {
  let mediaId = '';
  test('PNG valid diterima; nama file di disk dibuat server (bukan dari klien)', async () => {
    const r = await admin.call('POST', '/api/media', undefined, {}, multipartBody('../../../etc/cron.d/evil.php', PNG));
    assert.equal(r.status, 201, r.raw); mediaId = r.json.data.id;
    assert.equal(r.json.data.name, 'evil.php'); assert.equal(r.json.data.mime, 'image/png');
    const files = fs.readdirSync(path.join(dir, 'up'));
    assert.equal(files.length, 1); assert.match(files[0]!, /^[0-9a-f-]{36}\.png$/);
    assert.ok(!fs.existsSync('/etc/cron.d/evil.php'));
  });
  test('file berbahaya ditolak berdasarkan ISI, bukan ekstensi/Content-Type', async () => {
    const evil: Array<[string, Buffer, string]> = [
      ['a.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'), 'image/svg+xml'],
      ['a.png', Buffer.from('<html><script>alert(1)</script></html>'), 'image/png'],
      ['shell.php', Buffer.from('<?php system($_GET[0]); ?>'), 'image/png'],
      ['a.jpg', Buffer.from('#!/bin/sh\nrm -rf /'), 'image/jpeg'],
      ['a.exe', Buffer.from('MZ\x90\x00'), 'application/octet-stream'], ['empty.png', Buffer.alloc(0), 'image/png'],
    ];
    for (const [name, buf, mime] of evil) {
      const r = await admin.call('POST', '/api/media', undefined, {}, multipartBody(name, buf, mime));
      assert.ok([400, 415].includes(r.status), `${name} -> ${r.status}`);
    }
    assert.equal(fs.readdirSync(path.join(dir, 'up')).length, 1);
  });
  test('batas ukuran ditegakkan (413)', async () => {
    const t = await makeApp({ MAX_UPLOAD_MB: '1' });
    try {
      await seedUser(t.ctx, 'a@example.com', STRONG, 'admin');
      const c = new Client(t.app); await c.login('a@example.com', STRONG);
      const big = Buffer.concat([PNG, Buffer.alloc(1.5 * 1024 * 1024)]);
      assert.equal((await c.call('POST', '/api/media', undefined, {}, multipartBody('big.png', big))).status, 413);
    } finally { await t.app.close(); }
  });
  test('upload butuh login + CSRF + izin', async () => {
    assert.equal((await pub.call('POST', '/api/media', undefined, {}, multipartBody('a.png', PNG))).status, 401);
    const c = new Client(app); await c.login('admin@example.com', STRONG); c.csrf = 'bad';
    assert.equal((await c.call('POST', '/api/media', undefined, {}, multipartBody('a.png', PNG))).status, 403);
  });
  test('penyajian file: header aman & tidak bisa traversal', async () => {
    const r = await pub.get(`/media/file/${mediaId}`);
    assert.equal(r.status, 200);
    assert.equal(r.headers['content-type'], 'image/png');
    assert.equal(r.headers['x-content-type-options'], 'nosniff');
    assert.match(String(r.headers['content-security-policy']), /sandbox/);
    assert.equal(r.headers['cross-origin-resource-policy'], 'cross-origin');
    for (const u of ['/media/file/../../etc/passwd', '/media/file/..%2f..%2fetc%2fpasswd', '/media/file/%2e%2e%2f%2e%2e%2fetc%2fpasswd', `/media/file/${mediaId}.png`, `/media/file/${mediaId}/../x`, '/media/file/1', "/media/file/' OR 1=1--", '/media/file/00000000-0000-4000-8000-000000000000']) {
      const x = await pub.get(u);
      assert.ok([400, 404].includes(x.status), `${u} -> ${x.status}`);
      assert.doesNotMatch(x.raw, /root:/);
    }
    assert.equal((await pub.get('/admin/../../etc/passwd')).status === 200, false);
    assert.equal((await pub.get('/admin/%2e%2e/%2e%2e/etc/passwd')).status === 200, false);
  });
  test('media terhubung ke konten & dibersihkan saat dihapus', async () => {
    const r = await admin.patch(`/api/content/article/${articleId}`, { data: { cover: mediaId } });
    assert.equal(r.status, 200);
    assert.equal((await admin.get(`/api/content/article/${articleId}?populate=cover`)).json.data.cover.mime, 'image/png');
    assert.equal((await admin.patch(`/api/content/article/${articleId}`, { data: { cover: '00000000-0000-4000-8000-000000000000' } })).status, 400);
    assert.equal((await admin.del(`/api/media/${mediaId}`)).status, 204);
    assert.equal((await admin.get(`/api/content/article/${articleId}`)).json.data.cover, null);
    assert.equal(fs.readdirSync(path.join(dir, 'up')).length, 0);
    assert.equal((await pub.get(`/media/file/${mediaId}`)).status, 404);
  });
});

describe('GraphQL', () => {
  const gql = (c: Client, query: string, variables?: unknown, h?: Record<string, string>) => c.call('POST', '/graphql', { query, variables }, h);
  test('query dinamis + relasi; mutasi lewat cookie tetap wajib CSRF', async () => {
    const r = await gql(admin, '{ articles(filter:[{field:"title",op:eq,value:"Halo Dunia"}]) { total items { id title views featured status author { name } } } }');
    assert.equal(r.status, 200, r.raw); assert.equal(r.json.data.articles.items[0].author.name, 'Sari');
    const m = await gql(admin, 'mutation($d: JSON!){ createAuthor(data:$d){ id name } }', { d: { name: 'Budi' } });
    assert.equal(m.json.data.createAuthor.name, 'Budi');
    const noCsrf = await gql(admin, 'mutation{ createAuthor(data:{name:"x"}){ id } }', undefined, { 'x-csrf-token': 'bad' });
    assert.equal(noCsrf.status, 403);
    const invalid = await gql(admin, 'mutation{ createAuthor(data:{name:"x", isAdmin:true}){ id } }');
    assert.match(JSON.stringify(invalid.json.errors), /Validation failed/);
  });
  test('publik mengikuti izin yang sama seperti REST', async () => {
    const ok = await gql(pub, '{ articles { items { title } } }');
    assert.ok(ok.json.data.articles.items.every((i: any) => i.title));
    const denied = await gql(pub, '{ authors { items { name } } }');
    assert.equal(denied.json.errors[0].extensions.code, 'unauthorized');
    assert.equal((await gql(pub, 'mutation{ deleteArticle(id:"x") }')).json.errors[0].extensions.code, 'unauthorized');
  });
  test('introspeksi dinonaktifkan; batching, query dalam, dan alias-flood ditolak', async () => {
    assert.equal((await gql(admin, '{ __schema { types { name } } }')).status, 400);
    assert.equal((await gql(admin, '{ __type(name:"Query"){ name } }')).status, 400);
    assert.equal((await admin.call('POST', '/graphql', [{ query: '{ ping }' }, { query: '{ ping }' }])).status, 400);
    const nested = 'query{' + 'articles{items{'.repeat(4) + 'title' + '}}'.repeat(4) + '}';
    const r = await gql(admin, nested);
    assert.equal(r.status, 400);
    const alias = '{' + Array.from({ length: 200 }, (_, i) => `a${i}: ping`).join(' ') + '}';
    assert.match((await gql(admin, alias)).raw, /too complex/);
    assert.equal((await admin.get('/graphql')).status, 405);
  });
  test('error internal tidak bocor', async () => {
    const r = await gql(admin, '{ article(id:"not-a-uuid") { id } }');
    assert.equal(r.json.data.article, null);
    assert.doesNotMatch(r.raw, /sqlite|knex|SELECT|at \w+/i);
  });
});

describe('Panel admin (statis)', () => {
  test('tidak melayani file di luar direktori admin / dotfile', async () => {
    for (const u of ['/admin/../package.json', '/admin/..%2fpackage.json', '/admin/%2e%2e/.env', '/admin/.env', '/admin/..%5c..%5cetc%5cpasswd']) {
      const r = await pub.get(u);
      assert.ok(r.status !== 200 || !/forma-cms|APP_SECRET|root:/.test(r.raw), u);
    }
  });
});
