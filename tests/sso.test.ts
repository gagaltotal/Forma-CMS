import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { Client as C } from './helpers.js';
import { Client, makeApp, seedUser } from './helpers.js';

/**
 * SSO (OIDC) diuji dengan penyedia identitas PALSU (fetch dipalsukan) — tidak ada jaringan keluar.
 * Fokus: alur PKCE/state, verifikasi ID token RS256, dan penolakan akun yang belum terdaftar.
 */

const ISSUER = 'https://idp.example.com';
const CLIENT_ID = 'forma-client';

const b64url = (input: Buffer | string): string =>
  (Buffer.isBuffer(input) ? input : Buffer.from(input)).toString('base64url');

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = publicKey.export({ format: 'jwk' }) as Record<string, unknown>;
const KID = 'test-key-1';

function idToken(claims: Record<string, unknown>): string {
  const header = b64url(JSON.stringify({ alg: 'RS256', kid: KID, typ: 'JWT' }));
  const payload = b64url(JSON.stringify(claims));
  const sig = crypto.sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), privateKey);
  return `${header}.${payload}.${b64url(sig)}`;
}

const discoveryDoc = {
  issuer: ISSUER,
  authorization_endpoint: `${ISSUER}/authorize`,
  token_endpoint: `${ISSUER}/token`,
  jwks_uri: `${ISSUER}/jwks`,
  userinfo_endpoint: `${ISSUER}/userinfo`,
};

/** Tetapkan klaim apa yang akan dikembalikan token endpoint pada alur berikutnya. */
let nextClaims: Record<string, unknown> = {};

const originalFetch = globalThis.fetch;
function mockIdp(): void {
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    if (url.endsWith('/.well-known/openid-configuration')) return json(discoveryDoc);
    if (url.endsWith('/jwks')) return json({ keys: [{ ...jwk, kid: KID, use: 'sig', alg: 'RS256' }] });
    if (url.endsWith('/token')) {
      assert.equal(init?.method, 'POST');
      const form = new URLSearchParams(init?.body as string);
      assert.equal(form.get('grant_type'), 'authorization_code');
      assert.equal(form.get('client_id'), CLIENT_ID);
      assert.ok(form.get('code_verifier'), 'PKCE code_verifier harus dikirim');
      return json({ id_token: idToken(nextClaims), access_token: 'at', token_type: 'Bearer' });
    }
    return json({ error: 'not_found' }, 404);
  }) as typeof fetch;
}

let app: Awaited<ReturnType<typeof makeApp>>['app'];
let ctx: Awaited<ReturnType<typeof makeApp>>['ctx'];

before(async () => {
  mockIdp();
  const env = {
    SSO_ENABLED: 'true', SSO_ISSUER: ISSUER, SSO_CLIENT_ID: CLIENT_ID, SSO_CLIENT_SECRET: 's3cret',
    SSO_PROVIDER_NAME: 'Acme ID', SEED_HOMEPAGE_ON_BOOT: 'false',
  };
  ({ app, ctx } = await makeApp(env));
  await seedUser(ctx, 'staff@example.com', 'Correct-Horse-Battery-9', 'editor');
});
after(async () => {
  globalThis.fetch = originalFetch;
  await app.close();
});

/** Jalankan /start lalu kembalikan state OIDC yang dibuat server. */
async function start(client: C): Promise<string> {
  const res = await client.get('/api/auth/sso/start');
  assert.equal(res.status, 302);
  const location = new URL(res.headers.location as string);
  assert.equal(location.origin + location.pathname, `${ISSUER}/authorize`);
  assert.equal(location.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(location.searchParams.get('client_id'), CLIENT_ID);
  return location.searchParams.get('state')!;
}

describe('SSO (OIDC)', () => {
  test('info provider tersedia untuk publik (tanpa rahasia)', async () => {
    const res = await new Client(app).get('/api/auth/sso/info');
    assert.equal(res.status, 200);
    assert.deepEqual(res.json, { enabled: true, providerName: 'Acme ID', startUrl: '/api/auth/sso/start' });
    assert.ok(!JSON.stringify(res.json).includes('s3cret'));
  });

  test('start membuat state + PKCE dan mengarahkan ke penyedia', async () => {
    const client = new Client(app);
    const state = await start(client);
    const row = await ctx.models.ssoStates.find(state);
    assert.ok(row, 'state harus tersimpan');
    assert.ok(row!.code_verifier.length > 20);
    assert.ok(row!.nonce.length > 10);
  });

  test('login SSO untuk akun terdaftar: cookie sesi dipasang, role tetap dari CMS', async () => {
    const client = new Client(app);
    const state = await start(client);
    const row = (await ctx.models.ssoStates.find(state))!;
    nextClaims = {
      iss: ISSUER, aud: CLIENT_ID, sub: 'abc123', email: 'staff@example.com', email_verified: true,
      name: 'Staff', nonce: row.nonce, exp: Math.floor(Date.now() / 1000) + 600,
    };
    const cb = await client.get(`/api/auth/sso/callback?code=xyz&state=${state}`);
    assert.equal(cb.status, 200);
    assert.match(cb.raw, /window\.location\.replace/);
    assert.match(client.cookie, /forma_sid=/);

    const me = await client.get('/api/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.json.user.email, 'staff@example.com');
    assert.equal(me.json.user.role.name, 'Editor'); // izin mengikuti role di CMS
  });

  test('state hanya sekali pakai (replay ditolak)', async () => {
    const client = new Client(app);
    const state = await start(client);
    const row = (await ctx.models.ssoStates.find(state))!;
    nextClaims = {
      iss: ISSUER, aud: CLIENT_ID, email: 'staff@example.com', email_verified: true,
      nonce: row.nonce, exp: Math.floor(Date.now() / 1000) + 600,
    };
    const first = await client.get(`/api/auth/sso/callback?code=a&state=${state}`);
    assert.equal(first.status, 200);
    const second = await client.get(`/api/auth/sso/callback?code=a&state=${state}`);
    assert.match(second.raw, /sso_error=/);
  });

  test('akun belum terdaftar ditolak (tanpa auto-provision)', async () => {
    const client = new Client(app);
    const state = await start(client);
    const row = (await ctx.models.ssoStates.find(state))!;
    nextClaims = {
      iss: ISSUER, aud: CLIENT_ID, email: 'stranger@example.com', email_verified: true,
      nonce: row.nonce, exp: Math.floor(Date.now() / 1000) + 600,
    };
    const cb = await client.get(`/api/auth/sso/callback?code=xyz&state=${state}`);
    assert.equal(cb.status, 200);
    assert.match(cb.raw, /belum%20terdaftar|belum terdaftar/);
    // Tidak ada sesi yang dipasang.
    const me = await client.get('/api/auth/me');
    assert.equal(me.status, 401);
  });

  test('nonce yang salah ditolak (token bukan untuk alur ini)', async () => {
    const client = new Client(app);
    const state = await start(client);
    nextClaims = {
      iss: ISSUER, aud: CLIENT_ID, email: 'staff@example.com', email_verified: true,
      nonce: 'attacker-nonce', exp: Math.floor(Date.now() / 1000) + 600,
    };
    const cb = await client.get(`/api/auth/sso/callback?code=xyz&state=${state}`);
    assert.match(cb.raw, /sso_error=/);
  });

  test('email belum terverifikasi ditolak', async () => {
    const client = new Client(app);
    const state = await start(client);
    const row = (await ctx.models.ssoStates.find(state))!;
    nextClaims = {
      iss: ISSUER, aud: CLIENT_ID, email: 'staff@example.com', email_verified: false,
      nonce: row.nonce, exp: Math.floor(Date.now() / 1000) + 600,
    };
    const cb = await client.get(`/api/auth/sso/callback?code=xyz&state=${state}`);
    assert.match(cb.raw, /sso_error=/);
  });

  test('konfigurasi tidak lengkap: SSO_ENABLED tanpa client id/secret ditolak saat load config', async () => {
    await assert.rejects(
      () => makeApp({ SSO_ENABLED: 'true', SSO_ISSUER: ISSUER, SSO_CLIENT_ID: '', SSO_CLIENT_SECRET: '' }),
      /SSO_ENABLED/,
    );
  });
});