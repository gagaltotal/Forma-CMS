import { createReadStream } from 'node:fs';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppContext } from '../core/container.js';
import { badRequest, HttpError, notFound } from '../utils/errors.js';
import { uuidParams } from '../validators/common.validator.js';
import { mediaListQuery } from '../validators/media.validator.js';
import { parseWith } from '../validators/parse.js';

export class MediaController {
  constructor(private ctx: AppContext) {}
  private get media() { return this.ctx.services.media; }

  list = async (req: FastifyRequest) => this.media.list(parseWith(mediaListQuery, req.query));

  upload = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.isMultipart()) throw badRequest('Expected multipart/form-data');
    const part = await req.file();
    if (!part) throw badRequest('No file was uploaded');
    const tooLarge = () => new HttpError(413, 'file_too_large', `File exceeds ${this.ctx.cfg.MAX_UPLOAD_MB} MB`);
    let buffer: Buffer;
    try { buffer = await part.toBuffer(); } catch (e: any) {
      if (e?.code === 'FST_REQ_FILE_TOO_LARGE') throw tooLarge();
      throw e;
    }
    if (part.file.truncated) throw tooLarge();
    return reply.code(201).send({ data: await this.media.upload(req.principal, { filename: part.filename ?? 'file', buffer }) });
  };

  update = async (req: FastifyRequest) => ({ data: await this.media.update(uuidParams.parse(req.params).id, req.body) });

  remove = async (req: FastifyRequest, reply: FastifyReply) => {
    await this.media.remove(req.principal, uuidParams.parse(req.params).id);
    return reply.code(204).send();
  };

  /** Publik: file dicari lewat ID (UUID acak) di DB -> tidak ada path dari user yang menyentuh filesystem. */
  serve = async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = uuidParams.safeParse(req.params);
    if (!parsed.success) throw notFound();
    const { row, file } = await this.media.locate(parsed.data.id);

    const etag = `"${row.sha256}"`;
    reply.header('ETag', etag);
    if (req.headers['if-none-match'] === etag) return reply.code(304).send();

    const inline = String(row.mime).startsWith('image/');
    reply
      .header('Content-Type', row.mime)
      .header('Content-Length', Number(row.size))
      .header('X-Content-Type-Options', 'nosniff')
      .header('Content-Security-Policy', "default-src 'none'; sandbox")
      .header('Cross-Origin-Resource-Policy', 'cross-origin')
      .header('Cache-Control', 'public, max-age=31536000, immutable')
      .header('Content-Disposition', inline ? 'inline' : `attachment; filename*=UTF-8''${encodeURIComponent(row.original_name)}`);
    return reply.send(createReadStream(file));
  };
}
