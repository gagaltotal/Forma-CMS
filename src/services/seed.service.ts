import type { Principal } from '../security/permissions.js';
import { HOME_CONTENT_TYPE, buildHomepageTemplate } from '../config/homepage-template.js';
import type { ContentService } from './content.service.js';
import type { SchemaService } from './schema.service.js';

export type SeedOutcome = 'created' | 'updated' | 'skipped';

/**
 * Menyediakan halaman `home` siap pakai (landing page premium) tanpa perlu menulis JSON manual.
 * Dipakai oleh boot pertama server (opsional) dan CLI `npm run seed:homepage`.
 */
export class SeedService {
  constructor(private schema: SchemaService, private content: ContentService) {}

  async ensureHomepage(principal: Principal, opts: { force?: boolean } = {}): Promise<SeedOutcome> {
    let type = this.schema.get(HOME_CONTENT_TYPE.apiId);
    if (!type) {
      type = await this.schema.create(
        { apiId: HOME_CONTENT_TYPE.apiId, displayName: HOME_CONTENT_TYPE.displayName, fields: [...HOME_CONTENT_TYPE.fields] },
        principal,
      );
    }
    const data = buildHomepageTemplate();
    const list = await this.content.list(principal, type.apiId, { page: 1, pageSize: 1 });
    const existing = list.data[0];
    if (existing) {
      if (!opts.force) return 'skipped';
      await this.content.update(principal, type.apiId, String(existing.id), { status: 'published', data });
      return 'updated';
    }
    await this.content.create(principal, type.apiId, { status: 'published', data });
    return 'created';
  }
}