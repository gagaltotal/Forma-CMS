import { likeEsc } from './entry.query.js';
import { BaseModel } from './base.model.js';

export interface MediaRow {
  id: string; stored_name: string; original_name: string; mime: string; size: number; sha256: string;
  alt: string; uploaded_by: string | null; created_at: number;
}

export class MediaModel extends BaseModel {
  find(id: string): Promise<MediaRow | undefined> { return this.db('forma_media').where({ id }).first(); }
  findMany(ids: string[]): Promise<MediaRow[]> { return this.db('forma_media').whereIn('id', ids); }
  async exists(id: string): Promise<boolean> { return !!(await this.db('forma_media').where({ id }).first('id')); }

  async list(o: { page: number; pageSize: number; q?: string }): Promise<{ rows: MediaRow[]; total: number }> {
    const base = this.db('forma_media');
    if (o.q) base.whereRaw("lower(original_name) like ? escape '!'", [`%${likeEsc(o.q)}%`]);
    const total: any = await base.clone().count({ c: '*' }).first();
    const rows = await base.clone().orderBy('created_at', 'desc').limit(o.pageSize).offset((o.page - 1) * o.pageSize);
    return { rows, total: Number(total?.c ?? 0) };
  }
  insert(row: MediaRow): Promise<unknown> { return this.db('forma_media').insert(row); }
  update(id: string, patch: Partial<MediaRow>): Promise<number> { return this.db('forma_media').where({ id }).update(patch); }
  delete(id: string): Promise<number> { return this.db('forma_media').where({ id }).delete(); }
}
