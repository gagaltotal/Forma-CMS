import type { Db } from '../connection.js';
import * as m001 from './001_create_roles_and_users.js';
import * as m002 from './002_create_sessions_and_tokens.js';
import * as m003 from './003_create_content_types_and_media.js';
import * as m004 from './004_create_audit_log.js';
import * as m005 from './005_seed_system_roles.js';
import * as m006 from './006_add_2fa_and_versioning.js';
import * as m007 from './007_create_sso_states.js';

export interface Migration { name: string; up: (db: Db) => Promise<void> }

/** Urutan eksekusi. Setiap migrasi idempoten sehingga database lama dari versi sebelumnya tetap kompatibel. */
export const migrations: Migration[] = [m001, m002, m003, m004, m005, m006, m007];
