import type { Knex } from 'knex';
import type { Db } from '../database/connection.js';

/** Koneksi biasa atau transaksi. Method model menerima `trx` opsional agar service bisa membuat unit-of-work. */
export type Conn = Knex | Knex.Transaction;

export abstract class BaseModel {
  constructor(protected readonly db: Db) {}
  protected conn(trx?: Conn): Conn { return trx ?? this.db; }
}
