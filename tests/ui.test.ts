import assert from 'node:assert/strict';
import fs from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { JSDOM, VirtualConsole } from 'jsdom';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../src/core/container.js';
import { makeApp, seedUser, STRONG } from './helpers.js';

const PORT = 38417;
let app: FastifyInstance, ctx: AppContext, dom: JSDOM, win: any, doc: Document;
const pageErrors: string[] = [];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor<T>(fn: () => T | null | undefined | false, what: string, ms = 5000): Promise<T> {
  const t0 = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v as T;
    if (Date.now() - t0 > ms) throw new Error(`Timeout menunggu: ${what}\nHash: ${win.location.hash}\nMain: ${doc.querySelector('main')?.textContent?.slice(0, 300)}\nToast: ${doc.getElementById('toasts')?.textContent}`);
    await sleep(15);
  }
}
const q = <T extends Element = HTMLElement>(sel: string) => doc.querySelector<T>(sel);
const byText = (sel: string, text: string) => [...doc.querySelectorAll<HTMLElement>(sel)].find((e) => e.textContent?.trim() === text);
const setVal = (el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, v: string) => { el.value = v; el.dispatchEvent(new win.Event('input', { bubbles: true })); el.dispatchEvent(new win.Event('change', { bubbles: true })); };
const go = async (hash: string, expectText: string) => { if (win.location.hash === hash) win.dispatchEvent(new win.Event('forma:refresh')); else win.location.hash = hash; await sleep(70); await waitFor(() => q('main h1')?.textContent?.includes(expectText) ? true : q('main .empty h3')?.textContent?.includes(expectText), `halaman "${expectText}" di ${hash}`); };

function jar(base: string) {
  let cookie = '';
  return async (input: any, init: any = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, base);
    const headers = new Headers(init.headers ?? {});
    if (cookie) headers.set('cookie', cookie);
    headers.set('user-agent', 'ui-test');
    const res = await fetch(url, { ...init, headers, redirect: 'manual' });
    for (const c of res.headers.getSetCookie?.() ?? []) { const kv = c.split(';')[0]!; cookie = kv.split('=')[1] ? kv : ''; }
    return res;
  };
}

before(async () => {
  ({ app, ctx } = await makeApp({ PUBLIC_URL: `http://127.0.0.1:${PORT}` }));
  await seedUser(ctx, 'admin@example.com', STRONG, 'admin');
  await app.listen({ host: '127.0.0.1', port: PORT });
  const base = `http://127.0.0.1:${PORT}/admin/`;
  const html = await (await fetch(base)).text();
  assert.match(html, /<div id="app">/);
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => { if (!/Not implemented/.test(String(e.message))) pageErrors.push(String(e.stack ?? e.message)); });
  dom = new JSDOM(html, { url: base, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  win = dom.window; doc = win.document;
  win.fetch = jar(base); win.structuredClone = structuredClone;
  win.addEventListener('error', (e: any) => pageErrors.push(String(e.error?.stack ?? e.message)));
  win.addEventListener('unhandledrejection', (e: any) => pageErrors.push(String(e.reason?.stack ?? e.reason)));
  win.eval(fs.readFileSync('dist/admin/app.js', 'utf8'));
});
after(async () => { win?.close(); await app.close(); });

describe('Panel admin (jsdom, bundel asli)', () => {
  test('login: kredensial salah ditolak, benar masuk ke dashboard', async () => {
    const form = await waitFor(() => q<HTMLFormElement>('form'), 'form login');
    setVal(q<HTMLInputElement>('#email')!, 'admin@example.com'); setVal(q<HTMLInputElement>('#password')!, 'salah-salah-12345');
    form.dispatchEvent(new win.Event('submit', { cancelable: true, bubbles: true }));
    await waitFor(() => q('.error-text')?.textContent, 'pesan error login');
    assert.match(q('.error-text')!.textContent!, /Invalid email or password/);
    setVal(q<HTMLInputElement>('#password')!, STRONG);
    form.dispatchEvent(new win.Event('submit', { cancelable: true, bubbles: true }));
    await waitFor(() => q('.rail') && q('main h1')?.textContent?.startsWith('Hello'), 'dashboard');
    assert.ok(byText('.nav-link span', 'Content types'), 'menu builder tampil untuk admin');
    assert.match(q('.app-footer')?.textContent ?? '', new RegExp(`© ${new Date().getFullYear()} Forma`));
  });

  test('builder: membuat tipe konten secara visual + pratinjau API langsung', async () => {
    await go('#/builder/new', 'Content types');
    setVal(q<HTMLInputElement>('.b-cols input')!, 'Blog post');
    const apiName = q<HTMLInputElement>('.b-cols input.mono')!;
    assert.equal(apiName.value, 'blog_post', 'API name diturunkan otomatis');
    for (const label of ['Short text', 'Rich text', 'Whole number', 'Yes / No']) {
      byText('button', 'Add field')!.click();
      const card = await waitFor(() => [...doc.querySelectorAll<HTMLElement>('.type-card')].find((c) => c.querySelector('strong')?.textContent === label), `kartu ${label}`);
      card.click();
      await waitFor(() => !q('.overlay'), 'modal tertutup');
    }
    const names = [...doc.querySelectorAll<HTMLInputElement>('.frow-body input.mono')];
    assert.equal(names.length, 4);
    setVal(names[0]!, 'title'); setVal(names[1]!, 'body'); setVal(names[2]!, 'views'); setVal(names[3]!, 'featured');
    const preview = q('.preview')!.textContent!;
    assert.match(preview, /GET\s+\/api\/content\/blog_post/); assert.match(preview, /blogPosts|blog_posts/); assert.match(preview, /"views": 42/); assert.match(preview, /type BlogPost/);
    byText('.frow-body .switch span:last-child', 'Required')!.closest('label')!.querySelector('input')!.click(); // field pertama: required
    byText('button', 'Create content type')!.click();
    await waitFor(() => win.location.hash === '#/builder/blog_post', 'redirect setelah simpan');
    await waitFor(() => byText('.nav-link span', 'Blog post'), 'tipe baru muncul di sidebar');
    const t = await (await win.fetch('/api/admin/content-types')).json();
    assert.equal(t.data[0].fields.length, 4); assert.equal(t.data[0].fields[0].required, true);
    await go('#/builder/blog_post', 'Content types');
    const firstField = () => [...doc.querySelectorAll<HTMLElement>('.frow')].find((row) => row.querySelector('code')?.textContent === 'title')!;
    firstField().querySelector<HTMLButtonElement>('.frow-main')!.click();
    const typeSelect = firstField().querySelector<HTMLSelectElement>('select')!;
    setVal(typeSelect, 'email');
    assert.equal(typeSelect.value, 'email', 'tipe field existing dapat diubah');
    const uniqueSwitch = [...firstField().querySelectorAll<HTMLElement>('.switch')].find((el) => el.textContent?.includes('Unique'))!;
    uniqueSwitch.querySelector<HTMLInputElement>('input')!.click();
    assert.ok(firstField().querySelector('.pill.ok')?.textContent?.includes('Unique'));
  });

  test('editor entri: validasi server tampil per-field, lalu publish', async () => {
    await go('#/c/blog_post/new', 'New blog post');
    byText('button', 'Save draft')!.click();
    await waitFor(() => q('.field.invalid .error-text'), 'error validasi pada field wajib');
    setVal(q<HTMLInputElement>('#f_title')!, 'Halo dunia');
    setVal(q<HTMLInputElement>('#f_views')!, '7');
    const rte = q('.rte-area')!; rte.appendChild(doc.createTextNode('Isi artikel'));
    byText('button', 'Publish')!.click();
    await waitFor(() => /^#\/c\/blog_post\/[0-9a-f-]{36}$/.test(win.location.hash), 'redirect ke entri baru');
    await waitFor(() => q('main h1')?.textContent === 'Halo dunia', 'judul editor');
    assert.equal(q('.side .pill')!.textContent, 'Published');
    await go('#/c/blog_post', 'Blog post');
    await waitFor(() => q('table.clickable tbody tr'), 'baris entri di daftar');
    assert.match(q('table.clickable tbody')!.textContent!, /Halo dunia/);
  });

  test('XSS: data berbahaya hanya dirender sebagai teks, tidak ada elemen/handler aktif', async () => {
    const evil = '<img src=x onerror="window.__pwned=1"><script>window.__pwned=2</script>';
    const r = await win.fetch('/api/content/blog_post', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': await csrf() }, body: JSON.stringify({ status: 'published', data: { title: evil, body: '<p>ok</p>' } }) });
    assert.equal(r.status, 201);
    const id = (await r.json()).data.id;
    // Simulasi database yang sudah terkontaminasi (bypass sanitasi server) untuk menguji pertahanan berlapis di klien:
    await ctx.db('ct_blog_post').where({ id }).update({ body: '<p onclick="window.__pwned=3">x</p><img src=x onerror="window.__pwned=4"><script>window.__pwned=5</script><a href="javascript:window.__pwned=6">l</a><iframe src="//evil"></iframe><b>tebal</b>' });
    await go('#/c/blog_post', 'Blog post');
    await waitFor(() => [...doc.querySelectorAll('td')].some((td) => td.textContent?.includes('<img src=x')), 'judul berbahaya tampil sebagai teks');
    assert.equal(doc.querySelectorAll('main img, main script').length, 0, 'tidak ada <img>/<script> hasil injeksi di daftar');
    win.location.hash = `#/c/blog_post/${id}`;
    await waitFor(() => q('.rte-area'), 'editor rich text');
    const area = q('.rte-area')!;
    assert.equal(area.querySelectorAll('script, iframe').length, 0);
    assert.doesNotMatch(area.innerHTML, /onerror|onclick|javascript:|<script|<iframe/i);
    assert.ok(area.querySelector('b'), 'format aman (<b>) dipertahankan');
    const handlers = [...doc.querySelectorAll('*')].flatMap((e) => [...e.attributes]).filter((a) => /^on/i.test(a.name));
    assert.deepEqual(handlers.map((a) => a.name), [], 'tidak ada atribut event-handler inline di DOM');
    assert.equal(win.__pwned, undefined);
  });

  test('semua halaman administrasi dapat dirender tanpa error', async () => {
    for (const [hash, text] of [['#/media', 'Media library'], ['#/roles', 'Roles'], ['#/roles/public', 'Roles'], ['#/roles/admin', 'Roles'], ['#/users', 'Users'], ['#/tokens', 'API tokens'], ['#/audit', 'Audit log'], ['#/account', 'Account'], ['#/', 'Hello'], ['#/builder', 'Content types'], ['#/builder/blog_post', 'Content types']]) {
      await go(hash!, text!);
      await sleep(30);
      assert.ok(!q('main .empty h3')?.textContent?.includes('went wrong'), `${hash}: ${q('main')?.textContent?.slice(0, 200)}`);
    }
    await go('#/roles/public', 'Roles');
    const publicBoxes = [...doc.querySelectorAll<HTMLInputElement>('.matrix tbody input')];
    assert.ok(publicBoxes.some((b) => !b.disabled) && publicBoxes.filter((b) => !b.disabled).length === 2, 'role Public: hanya kolom "View published" yang aktif');
    await go('#/roles/admin', 'Roles');
    assert.ok([...doc.querySelectorAll<HTMLInputElement>('.matrix input')].every((b) => b.disabled && b.checked), 'role admin terkunci penuh');
    await go('#/audit', 'Audit log');
    byText('button', 'Verify integrity')!.click();
    await waitFor(() => q('.notice.ok'), 'hasil verifikasi audit');
  });

  test('pengguna & token: membuat lewat UI; token hanya ditampilkan sekali', async () => {
    await go('#/roles', 'Roles');
    byText('button', 'New role')!.click();
    const inp = await waitFor(() => q<HTMLInputElement>('.dialog input'), 'modal role');
    setVal(inp, 'Reader'); byText('.dialog button', 'Create role')!.click();
    await waitFor(() => /^#\/roles\/[0-9a-f-]{36}$/.test(win.location.hash), 'role baru');
    await waitFor(() => q('main h2.h3')?.textContent === 'Reader' && q('.matrix'), 'editor role baru');
    const wild = doc.querySelector<HTMLInputElement>('.matrix tbody tr:first-child td:nth-child(2) input')!;
    wild.click();
    const perTypeRead = doc.querySelector<HTMLInputElement>('.matrix tbody tr:nth-child(2) td:nth-child(2) input')!;
    assert.ok(perTypeRead.checked && perTypeRead.disabled, 'wildcard menyalakan & mengunci sel per-tipe tanpa render ulang');
    assert.equal(q('main h2.h3')!.textContent, 'Reader', 'view tidak dirender ulang');
    byText('button', 'Save role')!.click();
    await waitFor(() => doc.getElementById('toasts')?.textContent?.includes('Role saved'), 'role tersimpan');

    await go('#/tokens', 'API tokens');
    byText('button', 'New token')!.click();
    setVal(await waitFor(() => q<HTMLInputElement>('.dialog input'), 'modal token'), 'Website');
    byText('.dialog button', 'Create token')!.click();
    const tokenInput = await waitFor(() => q<HTMLInputElement>('.dialog input[readonly]'), 'token ditampilkan');
    assert.match(tokenInput.value, /^fma_[A-Za-z0-9_-]{43}$/);
    const token = tokenInput.value;
    byText('.dialog button', 'I have saved it')!.click();
    await waitFor(() => q('table') && !q('.overlay'), 'daftar token');
    assert.ok(!doc.body.textContent!.includes(token), 'token penuh tidak tampil lagi setelah ditutup');
    const api = await fetch(`http://127.0.0.1:${PORT}/api/content/blog_post`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(api.status, 200);
    assert.ok((await api.json()).data.every((e: any) => e.status === 'published'));
  });

  test('kustomisasi tampilan: tema, warna aksen, dan kepadatan tersimpan', async () => {
    await go('#/account', 'Account');
    byText('.segmented button', 'Dark')!.click();
    assert.equal(doc.documentElement.getAttribute('data-theme'), 'dark');
    await waitFor(() => q('.swatch'), 'swatch');
    q<HTMLElement>('.swatch[aria-label="Iris"]')!.click();
    assert.equal(doc.documentElement.style.getPropertyValue('--accent'), '#7c6cf0');
    assert.equal(doc.documentElement.style.getPropertyValue('--accent-ink'), '#ffffff');
    byText('.segmented button', 'Compact')!.click();
    assert.equal(doc.documentElement.getAttribute('data-density'), 'compact');
    assert.match(win.localStorage.getItem('forma.prefs.v1'), /"#7c6cf0"/);
    // Nilai rusak/berbahaya di localStorage tidak boleh lolos ke CSS: uji modul prefs langsung dengan storage yang diracuni.
    (globalThis as any).localStorage = { getItem: () => '{"accent":"red;background:url(//evil)","theme":"<x>","density":"__proto__","rail":1}', setItem() {}, removeItem() {} };
    const { loadPrefs, DEFAULT_PREFS } = await import('../admin/src/core/prefs.ts');
    assert.deepEqual(loadPrefs(), DEFAULT_PREFS);
    (globalThis as any).localStorage = { getItem: () => '{"accent":"#AbCdEf","theme":"dark","density":"compact","rail":"closed"}' };
    assert.deepEqual(loadPrefs(), { theme: 'dark', accent: '#AbCdEf', density: 'compact', rail: 'closed' });
    delete (globalThis as any).localStorage;
  });

  test('password diganti dari UI; logout mengembalikan ke layar login', async () => {
    await go('#/account', 'Account');
    const [cur, nw, again] = [...doc.querySelectorAll<HTMLInputElement>('form input[type=password]')];
    setVal(cur!, STRONG); setVal(nw!, 'Another-Strong-Pass-77'); setVal(again!, 'Another-Strong-Pass-77');
    q<HTMLFormElement>('main form')!.dispatchEvent(new win.Event('submit', { cancelable: true, bubbles: true }));
    await waitFor(() => doc.getElementById('toasts')?.textContent?.includes('Password changed'), 'password diganti');
    byText('.nav-link span', 'Sign out')!.closest('button')!.click();
    await waitFor(() => q('.login-card'), 'layar login');
  });

  test('tidak ada error JavaScript selama seluruh sesi UI', () => {
    assert.deepEqual(pageErrors, []);
  });
});

async function csrf(): Promise<string> { return (await (await win.fetch('/api/auth/me')).json()).csrfToken; }
