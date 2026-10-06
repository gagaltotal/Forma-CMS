import { ZodError, type z } from 'zod';
import { badRequest } from '../utils/errors.js';

/** Parse + ubah ZodError menjadi HttpError 400 yang aman ditampilkan (tanpa membocorkan input). */
export function parseWith<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  try {
    return schema.parse(input);
  } catch (e) {
    if (e instanceof ZodError) {
      throw badRequest('Validation failed', e.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
    }
    throw e;
  }
}
