import type { Db } from '../connection.js';

export const name = '006_add_2fa_and_versioning';

/** Tambah kolom 2FA di users, tabel password reset tokens, dan tabel content versions. */
export async function up(db: Db): Promise<void> {
  // --- Kolom 2FA di users (idempoten) ---
  const hasTotpSecret = await db.schema.hasColumn('forma_users', 'totp_secret');
  const hasTotpEnabled = await db.schema.hasColumn('forma_users', 'totp_enabled');
  const hasBackupCodes = await db.schema.hasColumn('forma_users', 'backup_codes');
  if (!hasTotpSecret || !hasTotpEnabled || !hasBackupCodes) {
    await db.schema.alterTable('forma_users', (t) => {
      if (!hasTotpSecret) t.string('totp_secret', 100).nullable();
      if (!hasTotpEnabled) t.boolean('totp_enabled').defaultTo(false).notNullable();
      if (!hasBackupCodes) t.text('backup_codes').nullable(); // JSON array of hashed backup codes
    });
  }

  // --- Tabel password reset tokens ---
  if (!(await db.schema.hasTable('forma_password_reset_tokens'))) {
    await db.schema.createTable('forma_password_reset_tokens', (t) => {
      t.string('id', 36).primary();
      t.string('user_id', 36).notNullable().references('id').inTable('forma_users').onDelete('CASCADE');
      t.string('token_hash', 64).notNullable().unique();
      t.bigInteger('expires_at').notNullable();
      t.bigInteger('created_at').notNullable();
      t.index('user_id');
      t.index('expires_at');
    });
  }

  // --- Tabel content versions untuk versioning ---
  // Tidak memakai FK ke entri karena entri disimpan di tabel dinamis `ct_<apiId>`.
  if (!(await db.schema.hasTable('forma_content_versions'))) {
    await db.schema.createTable('forma_content_versions', (t) => {
      t.string('id', 36).primary();
      t.string('entry_id', 36).notNullable();
      t.integer('version_number').notNullable();
      t.text('data').notNullable(); // JSON snapshot of entry data
      t.string('status', 20).notNullable(); // draft or published at time of snapshot
      t.string('created_by', 36).nullable();
      t.bigInteger('created_at').notNullable();
      t.string('change_summary', 500).nullable();
      t.index('entry_id');
      t.index(['entry_id', 'version_number']);
      t.index('created_at');
    });
  }
}

export async function down(db: Db): Promise<void> {
  await db.schema.dropTableIfExists('forma_content_versions');
  await db.schema.dropTableIfExists('forma_password_reset_tokens');
  const hasTotpSecret = await db.schema.hasColumn('forma_users', 'totp_secret');
  if (hasTotpSecret) {
    await db.schema.alterTable('forma_users', (t) => {
      t.dropColumn('totp_secret');
      t.dropColumn('totp_enabled');
      t.dropColumn('backup_codes');
    });
  }
}
