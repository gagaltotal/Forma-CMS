import type { Db } from '../connection.js';

export const name = '007_create_sso_states';

/** Tabel state OIDC (PKCE + anti-CSRF) untuk alur SSO. Idempoten. */
export async function up(db: Db): Promise<void> {
  if (!(await db.schema.hasTable('forma_sso_states'))) {
    await db.schema.createTable('forma_sso_states', (t) => {
      t.string('state', 64).primary();
      t.string('code_verifier', 128).notNullable();
      t.string('nonce', 64).notNullable();
      t.string('redirect_to', 300).nullable();
      t.bigInteger('expires_at').notNullable();
      t.bigInteger('created_at').notNullable();
      t.index('expires_at');
    });
  }
}

export async function down(db: Db): Promise<void> {
  await db.schema.dropTableIfExists('forma_sso_states');
}