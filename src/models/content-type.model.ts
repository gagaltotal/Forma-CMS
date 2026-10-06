import type { ContentType } from '../types/content.js';
import { BaseModel, type Conn } from './base.model.js';

interface ContentTypeRow {
  id: string; api_id: string; plural_id: string; display_name: string; fields: string; created_at: number; updated_at: number;
}

const toContentType = (r: ContentTypeRow): ContentType => ({
  id: r.id, apiId: r.api_id, pluralId: r.plural_id, displayName: r.display_name,
  fields: JSON.parse(r.fields), createdAt: Number(r.created_at), updatedAt: Number(r.updated_at),
});

/** Menyimpan DEFINISI tipe konten (metadata). Tabel datanya dikelola oleh EntryModel. */
export class ContentTypeModel extends BaseModel {
  async all(): Promise<ContentType[]> {
    return (await this.db('forma_content_types').orderBy('created_at')).map(toContentType);
  }
  insert(ct: ContentType, trx?: Conn): Promise<unknown> {
    return this.conn(trx)('forma_content_types').insert({
      id: ct.id, api_id: ct.apiId, plural_id: ct.pluralId, display_name: ct.displayName,
      fields: JSON.stringify(ct.fields), created_at: ct.createdAt, updated_at: ct.updatedAt,
    });
  }
  update(ct: ContentType, trx?: Conn): Promise<number> {
    return this.conn(trx)('forma_content_types').where({ id: ct.id }).update({
      plural_id: ct.pluralId, display_name: ct.displayName, fields: JSON.stringify(ct.fields), updated_at: ct.updatedAt,
    });
  }
  delete(id: string, trx?: Conn): Promise<number> { return this.conn(trx)('forma_content_types').where({ id }).delete(); }
}
