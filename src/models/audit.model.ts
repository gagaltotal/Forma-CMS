import { BaseModel } from './base.model.js';

export interface AuditRow {
  id?: number; ts: number; actor: string | null; action: string; target: string | null; ip: string | null;
  meta: string; prev_hash: string; hash: string;
}

export class AuditModel extends BaseModel {
  async lastHash(): Promise<string | null> {
    const r = await this.db('forma_audit').orderBy('id', 'desc').first('hash');
    return r?.hash ?? null;
  }
  insert(row: AuditRow): Promise<unknown> { return this.db('forma_audit').insert(row); }
  async count(): Promise<number> {
    const r: any = await this.db('forma_audit').count({ c: '*' }).first();
    return Number(r?.c ?? 0);
  }
  page(page: number, pageSize: number): Promise<AuditRow[]> {
    return this.db('forma_audit').orderBy('id', 'desc').limit(pageSize).offset((page - 1) * pageSize);
  }
  /** Untuk verifikasi rantai: baca berurutan secara bertahap. */
  batchAfter(afterId: number, limit: number): Promise<Required<AuditRow>[]> {
    return this.db('forma_audit').where('id', '>', afterId).orderBy('id').limit(limit);
  }
}
