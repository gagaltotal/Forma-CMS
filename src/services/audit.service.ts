import crypto from 'node:crypto';
import type { AuditModel } from '../models/audit.model.js';

interface AuditRec { ts: number; actor: string | null; action: string; target: string | null; ip: string | null; meta: string }

/**
 * Audit log tamper-evident: setiap baris memuat HMAC(APP_SECRET, hash_sebelumnya + isi).
 * Mengubah/menghapus/menyisipkan baris lama memutus rantai dan terdeteksi oleh verify().
 */
export class AuditService {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private audits: AuditModel, private secret: string) {}

  private mac(prev: string, r: AuditRec): string {
    return crypto.createHmac('sha256', this.secret).update(prev).update('|').update(JSON.stringify(r)).digest('hex');
  }

  log(action: string, actor: string | null, target: string | null, ip: string | null, meta: Record<string, unknown> = {}): Promise<void> {
    const run = async () => {
      const prev = (await this.audits.lastHash()) ?? 'GENESIS';
      const rec: AuditRec = { ts: Date.now(), actor, action, target, ip, meta: JSON.stringify(meta).slice(0, 4000) };
      await this.audits.insert({ ...rec, prev_hash: prev, hash: this.mac(prev, rec) });
    };
    // Diserialisasi agar rantai tidak bercabang; kegagalan log tidak boleh menjatuhkan request.
    const p = this.queue.then(run).catch((e) => console.error('[audit] gagal menulis log:', e?.message));
    this.queue = p;
    return p as Promise<void>;
  }

  async list(page: number, pageSize: number) {
    const [total, rows] = await Promise.all([this.audits.count(), this.audits.page(page, pageSize)]);
    return {
      data: rows.map((r) => ({ id: r.id, ts: Number(r.ts), actor: r.actor, action: r.action, target: r.target, ip: r.ip, meta: r.meta })),
      meta: { page, pageSize, total },
    };
  }

  async verify(): Promise<{ ok: boolean; checked: number; brokenAtId?: number }> {
    let prev = 'GENESIS', checked = 0, lastId = 0;
    for (;;) {
      const rows = await this.audits.batchAfter(lastId, 1000);
      if (!rows.length) return { ok: true, checked };
      for (const r of rows) {
        const rec: AuditRec = { ts: Number(r.ts), actor: r.actor, action: r.action, target: r.target, ip: r.ip, meta: r.meta };
        const expected = this.mac(prev, rec);
        const good = r.prev_hash === prev && r.hash.length === expected.length && crypto.timingSafeEqual(Buffer.from(r.hash), Buffer.from(expected));
        if (!good) return { ok: false, checked, brokenAtId: r.id };
        prev = r.hash; checked++; lastId = r.id;
      }
    }
  }
}
