import type { Db } from '../connection.js';

export const name = '001_create_roles_and_users';

export async function up(db: Db): Promise<void> {
  if (!(await db.schema.hasTable('forma_roles'))) {
    await db.schema.createTable('forma_roles', (t) => {
      t.string('id', 36).primary();
      t.string('name', 64).notNullable().unique();
      t.string('description', 255).notNullable().defaultTo('');
      t.boolean('is_system').notNullable().defaultTo(false);
      t.text('permissions').notNullable();
      t.bigInteger('created_at').notNullable();
    });
  }
  if (!(await db.schema.hasTable('forma_users'))) {
    await db.schema.createTable('forma_users', (t) => {
      t.string('id', 36).primary();
      t.string('email', 254).notNullable().unique();
      t.string('name', 100).notNullable();
      t.string('password_hash', 255).notNullable();
      t.string('role_id', 36).notNullable().references('id').inTable('forma_roles').onDelete('RESTRICT');
      t.boolean('active').notNullable().defaultTo(true);
      t.integer('failed_attempts').notNullable().defaultTo(0);
      t.bigInteger('locked_until').nullable();
      t.bigInteger('created_at').notNullable();
      t.bigInteger('last_login_at').nullable();
    });
  }
}
