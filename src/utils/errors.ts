/** Error yang aman ditampilkan ke klien. Error lain selalu di-mask menjadi 500. */
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
    public issues?: unknown,
  ) {
    super(message ?? code);
  }
}

export const badRequest = (msg: string, issues?: unknown) => new HttpError(400, 'validation_error', msg, issues);
export const unauthorized = (msg = 'Authentication required') => new HttpError(401, 'unauthorized', msg);
export const forbidden = (msg = 'You do not have permission to do this') => new HttpError(403, 'forbidden', msg);
export const notFound = (msg = 'Not found') => new HttpError(404, 'not_found', msg);
export const conflict = (msg: string) => new HttpError(409, 'conflict', msg);

/** Deteksi pelanggaran unique-constraint lintas database (SQLite, PostgreSQL, MySQL). */
export function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: string; errno?: number };
  return (
    err?.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
    err?.code === 'SQLITE_CONSTRAINT_PRIMARYKEY' ||
    err?.code === '23505' ||
    err?.code === 'ER_DUP_ENTRY'
  );
}
