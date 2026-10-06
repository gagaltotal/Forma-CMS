import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppContext } from '../core/container.js';
import { notFound } from '../utils/errors.js';
import { parseWith } from '../validators/parse.js';
import { versionListParams, versionListQuery, versionParams } from '../validators/version.validator.js';

/** Riwayat versi entri konten. Otorisasi per-tipe dilakukan ContentService karena bergantung pada `apiId`. */
export class VersionController {
  constructor(private readonly ctx: AppContext) {}

  private get versions() { return this.ctx.services.versions; }

  /** GET /api/content/:type/:id/versions - Daftar versi sebuah entri */
  list = async (req: FastifyRequest) => {
    const { id } = parseWith(versionListParams, req.params);
    const { limit } = parseWith(versionListQuery, req.query);
    return { versions: await this.versions.getVersions(id, limit) };
  };

  /** GET /api/content/:type/:id/versions/:version - Detail satu versi */
  get = async (req: FastifyRequest) => {
    const { id, version } = parseWith(versionParams, req.params);
    const data = await this.versions.getVersion(id, version);
    if (!data) throw notFound('Version not found');
    return data;
  };

  /** GET /api/content/:type/:id/versions/:version/data - Data versi untuk restore manual */
  getData = async (req: FastifyRequest) => {
    const { id, version } = parseWith(versionParams, req.params);
    const data = await this.versions.getVersion(id, version);
    if (!data) throw notFound('Version not found');
    return { data: data.data, status: data.status };
  };
}
