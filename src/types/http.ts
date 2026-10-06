/** Metadata request yang diteruskan controller/middleware ke service (service tidak boleh mengenal objek request Fastify). */
export interface RequestMeta { ip: string | null; userAgent: string }
