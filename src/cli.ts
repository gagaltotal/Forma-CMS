import { loadConfig } from './config/index.js';
import { createDb } from './database/connection.js';
import { migrate } from './database/migrate.js';
import { createModels } from './models/index.js';
import { checkPasswordStrength, hashPassword } from './security/password.js';
import { uuid } from './security/tokens.js';
import { AuditService } from './services/audit.service.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

/** Baca password tanpa echo. Untuk otomasi (CI/Docker) boleh lewat env FORMA_ADMIN_PASSWORD. */
function askHidden(q: string): Promise<string> {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) { console.error('Tidak ada TTY. Set FORMA_ADMIN_PASSWORD untuk mode non-interaktif.'); process.exit(1); }
    process.stdout.write(q);
    let buf = '';
    const stdin = process.stdin;
    stdin.setRawMode(true); stdin.resume(); stdin.setEncoding('utf8');
    const onData = (chunk: string) => {
      for (const c of chunk) {
        if (c === '\r' || c === '\n' || c === '\u0004') { stdin.setRawMode(false); stdin.pause(); stdin.off('data', onData); process.stdout.write('\n'); return resolve(buf); }
        if (c === '\u0003') process.exit(130);
        buf = c === '\u007f' || c === '\b' ? buf.slice(0, -1) : buf + c;
      }
    };
    stdin.on('data', onData);
  });
}

async function main() {
  const cmd = process.argv[2];
  const cfg = loadConfig();
  const db = createDb(cfg);
  await migrate(db);
  const models = createModels(db);
  const audit = new AuditService(models.audit, cfg.APP_SECRET);
  try {
    switch (cmd) {
      case 'create-admin': {
        const email = arg('email')?.toLowerCase();
        if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Gunakan --email valid');
        const password = process.env.FORMA_ADMIN_PASSWORD ?? (await askHidden('Password (min 12 karakter): '));
        const weak = checkPasswordStrength(password, email);
        if (weak) throw new Error(weak);
        if (await models.users.findByEmail(email)) throw new Error('Email sudah terdaftar');
        const id = uuid();
        await models.users.insert({ id, email, name: arg('name') ?? 'Administrator', password_hash: await hashPassword(password), role_id: 'admin', active: true, created_at: Date.now() });
        await audit.log('cli.create_admin', null, id, null);
        console.log(`Admin dibuat: ${email}`);
        break;
      }
      case 'reset-password': {
        const email = arg('email')?.toLowerCase();
        const u = email ? await models.users.findByEmail(email) : undefined;
        if (!u) throw new Error('User tidak ditemukan');
        const password = process.env.FORMA_ADMIN_PASSWORD ?? (await askHidden('Password baru: '));
        const weak = checkPasswordStrength(password, u.email);
        if (weak) throw new Error(weak);
        await models.users.update(u.id, { password_hash: await hashPassword(password), failed_attempts: 0, locked_until: null });
        await models.sessions.deleteByUser(u.id);
        await audit.log('cli.reset_password', null, u.id, null);
        console.log('Password diganti; semua sesi dicabut.');
        break;
      }
      case 'verify-audit': {
        const r = await audit.verify();
        console.log(r.ok ? `Audit log utuh (${r.checked} entri)` : `RANTAI AUDIT RUSAK pada id ${r.brokenAtId}`);
        process.exitCode = r.ok ? 0 : 2;
        break;
      }
      default:
        console.log('Perintah: create-admin --email <e> [--name <n>] | reset-password --email <e> | verify-audit');
    }
  } catch (e: any) {
    console.error(`Error: ${e.message}`);
    process.exitCode = 1;
  } finally {
    await db.destroy();
  }
}
await main();
