import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { makeApp, seedUser, STRONG } from '../tests/helpers.js';

async function unusedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not reserve a local port');
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

const port = await unusedPort();
const origin = `http://127.0.0.1:${port}`;
const { app, ctx } = await makeApp({ PUBLIC_URL: origin, LOGIN_MAX_PER_15MIN: '100', RATE_LIMIT_PER_MINUTE: '5000' });
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;

try {
  await seedUser(ctx, 'visual@example.com', STRONG, 'admin');
  await app.listen({ host: '127.0.0.1', port });
  const systemBrowser = process.env.CHROME_BIN ?? ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(existsSync);
  browser = await chromium.launch({ headless: true, ...(systemBrowser ? { executablePath: systemBrowser } : {}), args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto(`${origin}/admin/`, { waitUntil: 'networkidle' });
  await page.locator('#email').fill('visual@example.com');
  await page.locator('#password').fill(STRONG);
  await page.locator('#password').press('Enter');
  await page.locator('.rail').waitFor({ state: 'visible' });
  await page.locator('.app-footer').waitFor({ state: 'visible' });
  const footer = await page.locator('.app-footer').textContent();
  assert.match(footer ?? '', new RegExp(`© ${new Date().getFullYear()} Forma`));
  await page.locator('body').click({ position: { x: 600, y: 500 } });

  const output = path.resolve('test-results/visual');
  mkdirSync(output, { recursive: true });
  const desktop = await page.screenshot({ path: path.join(output, 'admin-desktop.png'), fullPage: true });
  assert.ok(desktop.byteLength > 10_000, 'desktop screenshot should contain rendered UI');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(150);
  const mobileLayout = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
  assert.ok(mobileLayout.document <= mobileLayout.viewport, `horizontal overflow at mobile width: ${JSON.stringify(mobileLayout)}`);
  assert.ok(await page.locator('.app-footer').isVisible());
  const mobile = await page.screenshot({ path: path.join(output, 'admin-mobile.png'), fullPage: true });
  assert.ok(mobile.byteLength > 10_000, 'mobile screenshot should contain rendered UI');
  assert.deepEqual(pageErrors, [], 'browser page should not emit uncaught errors');

  console.log(`Chromium visual check passed. Screenshots: ${output}`);
} finally {
  await browser?.close();
  await app.close();
}