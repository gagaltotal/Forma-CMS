import type { Db } from '../connection.js';

export const name = '003_create_content_types_and_media';

export async function up(db: Db): Promise<void> {
  if (!(await db.schema.hasTable('forma_content_types'))) {
    await db.schema.createTable('forma_content_types', (t) => {
      t.string('id', 36).primary();
      t.string('api_id', 40).notNullable().unique();
      t.string('plural_id', 44).notNullable().unique();
      t.string('display_name', 100).notNullable();
      t.text('fields').notNullable();
      t.bigInteger('created_at').notNullable();
      t.bigInteger('updated_at').notNullable();
    });
  }
  if (!(await db.schema.hasTable('forma_media'))) {
    await db.schema.createTable('forma_media', (t) => {
      t.string('id', 36).primary();
      t.string('stored_name', 80).notNullable();
      t.string('original_name', 160).notNullable();
      t.string('mime', 100).notNullable();
      t.bigInteger('size').notNullable();
      t.string('sha256', 64).notNullable();
      t.string('alt', 300).notNullable().defaultTo('');
      t.string('uploaded_by', 36).nullable();
      t.bigInteger('created_at').notNullable();
    });
  }
}
