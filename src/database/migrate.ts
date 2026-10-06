import { isUniqueViolation } from '../utils/errors.js';
import type { Db } from './connection.js';
import { migrations } from './migrations/index.js';

/** Menjalankan migrasi yang belum tercatat di tabel `forma_migrations`. Mengembalikan nama migrasi yang baru diterapkan. */
export async function migrate(db: Db): Promise<string[]> {
  if (!(await db.schema.hasTable('forma_migrations'))) {
    await db.schema.createTable('forma_migrations', (t) => {
      t.string('name', 100).primary();
      t.bigInteger('applied_at').notNullable();
    });
  }
  const done = new Set((await db('forma_migrations').select('name')).map((r: { name: string }) => r.name));
  const applied: string[] = [];
  for (const m of migrations) {
    if (done.has(m.name)) continue;
    await m.up(db);
    try {
      await db('forma_migrations').insert({ name: m.name, applied_at: Date.now() });
    } catch (e) {
      if (!isUniqueViolation(e)) throw e; // instance lain menerapkan migrasi yang sama secara bersamaan
    }
    applied.push(m.name);
  }
  return applied;
}
