import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

declare module 'express-serve-static-core' {
  interface Request {
    /** Correlates a response (and its logs) with a single request. */
    requestId: string;
  }
}

const SAFE_REQUEST_ID = /^[\w-]{8,64}$/;

/**
 * Reuses the X-Request-Id sent by the proxy when it looks sane (so logs can be
 * correlated end to end), otherwise generates one. Echoed in the response.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const incoming = req.header('x-request-id');
  req.requestId = incoming && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
}
