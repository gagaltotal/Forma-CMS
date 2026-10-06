import fs from 'node:fs';
import path from 'node:path';
import knex, { type Knex } from 'knex';
import pg from 'pg';
import type { Config } from '../config/index.js';

// PostgreSQL mengembalikan BIGINT sebagai string; paksa jadi number agar perilaku sama di semua DB.
pg.types.setTypeParser(20, (v: string) => parseInt(v, 10));

/**
 * Semua query memakai query-builder Knex dengan parameter binding ($1, ?) dan
 * identifier di-quote oleh Knex. Tidak ada string SQL hasil konkatenasi input pengguna.
 */
export function createDb(cfg: Config): Knex {
  if (cfg.DB_CLIENT === 'sqlite') {
    fs.mkdirSync(path.dirname(path.resolve(cfg.SQLITE_PATH)), { recursive: true, mode: 0o700 });
    return knex({
      client: 'better-sqlite3',
      connection: { filename: cfg.SQLITE_PATH },
      useNullAsDefault: true,
      pool: {
        afterCreate: (conn: any, done: (err: Error | null, conn: unknown) => void) => {
          conn.pragma('journal_mode = WAL');
          conn.pragma('foreign_keys = ON');
          done(null, conn);
        },
      },
    });
  }
  return knex({
    client: cfg.DB_CLIENT === 'postgres' ? 'pg' : 'mysql2',
    connection: cfg.DATABASE_URL,
    pool: { min: 0, max: 10 },
  });
}

export type Db = Knex;
