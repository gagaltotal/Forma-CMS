import { BaseModel } from './base.model.js';

export interface SessionRow {
  id: string; user_id: string; csrf_token: string; created_at: number; last_seen_at: number;
  expires_at: number; ip: string | null; ua_hash: string;
}

export class SessionModel extends BaseModel {
  find(id: string): Promise<SessionRow | undefined> { return this.db('forma_sessions').where({ id }).first(); }
  insert(row: SessionRow): Promise<unknown> { return this.db('forma_sessions').insert(row); }
  delete(id: string): Promise<number> { return this.db('forma_sessions').where({ id }).delete(); }
  deleteByUser(userId: string): Promise<number> { return this.db('forma_sessions').where({ user_id: userId }).delete(); }
  deleteExpired(now: number): Promise<number> { return this.db('forma_sessions').where('expires_at', '<', now).delete(); }
  touch(id: string, now: number): Promise<number> { return this.db('forma_sessions').where({ id }).update({ last_seen_at: now }); }

  /** Sisakan paling banyak `maxAfterInsert - 1` sesi lama (satu slot untuk sesi yang akan dibuat). */
  async trimOldest(userId: string, maxAfterInsert: number): Promise<void> {
    const old = await this.db('forma_sessions').where({ user_id: userId }).orderBy('created_at', 'desc').offset(maxAfterInsert - 1).select('id');
    if (old.length) await this.db('forma_sessions').whereIn('id', old.map((o: { id: string }) => o.id)).delete();
  }
}
