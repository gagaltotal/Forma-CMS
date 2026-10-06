import type { Db } from '../connection.js';

export const name = '002_create_sessions_and_tokens';

export async function up(db: Db): Promise<void> {
  if (!(await db.schema.hasTable('forma_sessions'))) {
    await db.schema.createTable('forma_sessions', (t) => {
      t.string('id', 64).primary(); // SHA-256 dari token; token asli tidak pernah disimpan
      t.string('user_id', 36).notNullable().references('id').inTable('forma_users').onDelete('CASCADE').index();
      t.string('csrf_token', 64).notNullable();
      t.bigInteger('created_at').notNullable();
      t.bigInteger('last_seen_at').notNullable();
      t.bigInteger('expires_at').notNullable();
      t.string('ip', 64).nullable();
      t.string('ua_hash', 64).notNullable();
    });
  }
  if (!(await db.schema.hasTable('forma_api_tokens'))) {
    await db.schema.createTable('forma_api_tokens', (t) => {
      t.string('id', 36).primary();
      t.string('name', 100).notNullable();
      t.string('token_hash', 64).notNullable().unique();
      t.string('token_prefix', 12).notNullable();
      t.string('role_id', 36).notNullable().references('id').inTable('forma_roles').onDelete('CASCADE');
      t.string('created_by', 36).nullable();
      t.bigInteger('expires_at').nullable();
      t.bigInteger('last_used_at').nullable();
      t.bigInteger('created_at').notNullable();
    });
  }
}
