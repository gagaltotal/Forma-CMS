import { loadConfig } from '../src/config/index.js';
import { buildApp } from '../src/app.js';

async function main() {
  const cfg = loadConfig(process.env);
  const { app, ctx } = await buildApp(cfg, { logger: false });

  try {
    const principal = ctx.services.sso.systemPrincipal(['home']);
    const force = process.argv.includes('--force') || process.env.SEED_FORCE === 'true';
    const outcome = await ctx.services.seed.ensureHomepage(principal, { force });
    if (outcome === 'created') console.log('Homepage seeded successfully: /');
    else if (outcome === 'updated') console.log('Homepage updated successfully: /');
    else console.log('Homepage already exists — gunakan `npm run seed:homepage -- --force` untuk menimpa.');
  } finally {
    await app.close();
  }
}

await main();
