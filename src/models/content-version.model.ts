import { BaseModel } from './base.model.js';

export interface ContentVersionRow {
  id: string;
  entry_id: string;
  version_number: number;
  data: string; // JSON
  status: 'draft' | 'published';
  created_by: string | null;
  created_at: number;
  change_summary: string | null;
}

export class ContentVersionModel extends BaseModel {
  async create(data: Omit<ContentVersionRow, 'created_at'>): Promise<void> {
    await this.db('forma_content_versions').insert({
      ...data,
      created_at: Date.now(),
    });
  }

  async findByEntryId(entryId: string, limit = 50): Promise<ContentVersionRow[]> {
    return this.db('forma_content_versions')
      .where({ entry_id: entryId })
      .orderBy('version_number', 'desc')
      .limit(limit);
  }

  async findVersion(entryId: string, versionNumber: number): Promise<ContentVersionRow | undefined> {
    return this.db('forma_content_versions')
      .where({ entry_id: entryId, version_number: versionNumber })
      .first();
  }

  async getLatestVersionNumber(entryId: string): Promise<number> {
    const result: any = await this.db('forma_content_versions')
      .where({ entry_id: entryId })
      .max('version_number as max')
      .first();
    return Number(result?.max ?? 0);
  }

  async countByEntryId(entryId: string): Promise<number> {
    const result: any = await this.db('forma_content_versions')
      .where({ entry_id: entryId })
      .count({ c: '*' })
      .first();
    return Number(result?.c ?? 0);
  }

  async deleteByEntryId(entryId: string): Promise<number> {
    return this.db('forma_content_versions').where({ entry_id: entryId }).delete();
  }
}
