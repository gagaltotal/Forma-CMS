import type { Db } from '../connection.js';

export const name = '004_create_audit_log';

export async function up(db: Db): Promise<void> {
  if (!(await db.schema.hasTable('forma_audit'))) {
    await db.schema.createTable('forma_audit', (t) => {
      t.increments('id');
      t.bigInteger('ts').notNullable();
      t.string('actor', 64).nullable();
      t.string('action', 64).notNullable();
      t.string('target', 128).nullable();
      t.string('ip', 64).nullable();
      t.text('meta').notNullable();
      t.string('prev_hash', 64).notNullable();
      t.string('hash', 64).notNullable();
    });
  }
}
