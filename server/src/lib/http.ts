import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError, type ZodType } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) { super(message); }
}
export const badRequest = (m: string, d?: unknown) => new HttpError(400, m, d);
export const unauthorized = (m = 'Sign in first') => new HttpError(401, m);
export const forbidden = (m = 'You do not have access to this') => new HttpError(403, m);
export const notFound = (m = 'Not found') => new HttpError(404, m);
export const conflict = (m: string) => new HttpError(409, m);
export const paymentRequired = (m: string) => new HttpError(402, m);

/** Parses and returns a request body, throwing a 400 with field messages when it does not match. */
export function parse<T>(schema: ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (!r.success) throw badRequest('Invalid input', r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  return r.data;
}

export const notFoundHandler: RequestHandler = (req, _res, next) => next(notFound(`No route for ${req.method} ${req.path}`));

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) return void res.status(err.status).json({ error: err.message, details: err.details });
  if (err instanceof ZodError) return void res.status(400).json({ error: 'Invalid input', details: err.issues });
  if (err?.type === 'entity.parse.failed') return void res.status(400).json({ error: 'Body is not valid JSON' });
  if (err?.code === 11000) return void res.status(409).json({ error: 'That record already exists' });
  console.error('[api] unhandled', err);
  res.status(500).json({ error: 'Something went wrong on the server' });
};
