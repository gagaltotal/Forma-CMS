import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { buildHomepageTemplate, HOME_CONTENT_TYPE } from '../src/config/homepage-template.js';
import { Client, makeApp } from './helpers.js';

describe('Landing page & seed homepage', () => {
  test('seed membuat tipe `home` + entri publik sehingga `/` menampilkan landing premium', async () => {
    const t = await makeApp({ SEED_HOMEPAGE_ON_BOOT: 'false' });
    try {
      const principal = t.ctx.services.sso.systemPrincipal(['home']);
      const outcome = await t.ctx.services.seed.ensureHomepage(principal);
      assert.equal(outcome, 'created');

      // Idempoten: pemanggilan kedua tidak membuat duplikat.
      assert.equal(await t.ctx.services.seed.ensureHomepage(principal), 'skipped');
      assert.equal(await t.ctx.services.seed.ensureHomepage(principal, { force: true }), 'updated');

      const res = await new Client(t.app).get('/');
      assert.equal(res.status, 200);
      // Field landasan template benar-benar dirender.
      assert.match(res.raw, /<title>Home<\/title>/);
      assert.match(res.raw, /premium digital experience/);
      assert.match(res.raw, /Structured content/);
      assert.match(res.raw, /Does it support SSO\?/);
      assert.match(res.raw, /landing\.css/);
      // Tidak ada skrip pihak ketiga (CSP 'self').
      assert.doesNotMatch(res.raw, /cdn\.|<script[^>]+src=["']https?:/);
    } finally {
      await t.app.close();
    }
  });

  test('template `home` berisi semua field yang dibaca resolver landing', () => {
    const data = buildHomepageTemplate();
    for (const field of HOME_CONTENT_TYPE.fields) {
      assert.ok(field.name in data, `template kehilangan field ${field.name}`);
    }
    assert.equal((data.stats as unknown[]).length, 3);
    assert.equal((data.features as unknown[]).length, 6);
    assert.equal((data.steps as unknown[]).length, 3);
    assert.equal((data.logos as unknown[]).length, 5);
    assert.equal((data.plans as unknown[]).length, 3);
    assert.equal((data.faq as unknown[]).length, 4);
    // Field json dikirim sebagai objek/array (bukan string) saat seeding programatik.
    assert.ok(Array.isArray(data.plans));
    assert.ok(typeof data.footer === 'string' && data.footer.length > 0);
  });

  test('SSO info publik hanya tersedia untuk semua role (tidak ada rahasia)', async () => {
    const t = await makeApp();
    try {
      const res = await new Client(t.app).get('/api/auth/sso/info');
      assert.equal(res.status, 200);
      assert.deepEqual(res.json, { enabled: false, providerName: 'SSO', startUrl: '/api/auth/sso/start' });
      // Tanpa SSO, start mengembalikan 404/redirect aman, bukan membocorkan konfigurasi.
      const start = await new Client(t.app).get('/api/auth/sso/start');
      assert.notEqual(start.status, 500);
    } finally {
      await t.app.close();
    }
  });
});