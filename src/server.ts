import { buildApp } from './app.js';
import { loadConfig } from './config/index.js';

const cfg = loadConfig();
const { app, ctx } = await buildApp(cfg);

if ((await ctx.models.users.count()) === 0) {
  app.log.warn('Belum ada pengguna. Buat admin pertama: npm run cli -- create-admin --email you@example.com');
}

// Pengalaman jalan pertama: siapkan halaman `home` siap pakai agar `/` langsung tampil sebagai landing page premium.
if (cfg.SEED_HOMEPAGE_ON_BOOT) {
  try {
    const outcome = await ctx.services.seed.ensureHomepage(ctx.services.sso.systemPrincipal(['home']));
    if (outcome !== 'skipped') app.log.info(`Homepage template siap pakai (${outcome}): /`);
  } catch (err) {
    app.log.warn({ err }, 'Gagal menyiapkan homepage bawaan (dilewati)');
  }
}

if (ctx.services.sso.enabled) {
  app.log.info(`SSO (OIDC) aktif via ${cfg.SSO_PROVIDER_NAME} — akun harus sudah terdaftar di Forma CMS.`);
}

await app.listen({ host: cfg.HOST, port: cfg.PORT });

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => { app.close().finally(() => process.exit(0)); });
}
process.on('unhandledRejection', (e) => { app.log.error({ err: e }, 'unhandledRejection'); });
