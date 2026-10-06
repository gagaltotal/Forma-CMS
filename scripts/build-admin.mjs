// Build panel admin: bundling TypeScript -> satu file JS (tanpa dependensi runtime di browser),
// plus kompilasi Tailwind untuk landing page publik (`/`) dari admin/landing.css.
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

process.env.BROWSERSLIST_IGNORE_OLD_DATA = '1';

const out = 'dist/admin';
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

await build({
  entryPoints: ['admin/src/main.ts'],
  bundle: true, format: 'esm', target: 'es2022', minify: true, sourcemap: false,
  outfile: `${out}/app.js`, legalComments: 'none', logLevel: 'info',
});

// Landing page publik memakai CSS Tailwind yang di-build lokal (BUKAN CDN).
// Ini penting karena CSP hanya mengizinkan script/style dari 'self'.
compileTailwind();

cpSync('admin/index.html', `${out}/index.html`);
cpSync('admin/styles.css', `${out}/styles.css`);

function compileTailwind() {
  const bin = process.platform === 'win32' ? 'node_modules/.bin/tailwindcss.cmd' : 'node_modules/.bin/tailwindcss';
  if (!existsSync(bin)) {
    console.warn('[build-admin] tailwindcss CLI tidak ditemukan; lewati kompilasi landing.css. Jalankan: npm install');
    return;
  }
  execFileSync(bin, ['-c', 'tailwind.config.mjs', '-i', 'admin/landing.css', '-o', `${out}/landing.css`, '--minify'], {
    stdio: 'inherit',
  });
  console.log(`[build-admin] landing.css -> ${out}/landing.css`);
}
