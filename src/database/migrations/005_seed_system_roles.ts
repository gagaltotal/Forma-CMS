import { SYSTEM_ROLES } from '../../config/constants.js';
import type { Db } from '../connection.js';

export const name = '005_seed_system_roles';

/** Hanya role bawaan. TIDAK ADA akun default: admin pertama dibuat lewat CLI. */
export async function up(db: Db): Promise<void> {
  for (const [id, r] of Object.entries(SYSTEM_ROLES)) {
    if (await db('forma_roles').where({ id }).first('id')) continue;
    await db('forma_roles').insert({
      id, name: r.name, description: r.description, is_system: true,
      permissions: JSON.stringify(r.permissions), created_at: Date.now(),
    });
  }
}
