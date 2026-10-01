import { Injectable, Logger } from '@nestjs/common';
import type { Request } from 'express';

/** Status codes worth an audit line: auth failures, access denials, throttling. */
const SECURITY_STATUSES = new Set([401, 403, 429]);

/**
 * Structured security audit log. Never logs bodies, passwords, tokens or
 * Authorization headers — only who/where/what happened.
 */
@Injectable()
export class SecurityLogger {
  private readonly logger = new Logger('Security');

  logClientError(request: Request, statusCode: number): void {
    if (!SECURITY_STATUSES.has(statusCode)) return;
    this.logger.warn(
      JSON.stringify({
        event: eventName(statusCode),
        status: statusCode,
        method: request.method,
        path: request.path,
        ip: request.ip,
        userId: (request.user as { id?: string } | undefined)?.id,
        requestId: request.requestId,
      }),
    );
  }
}

function eventName(status: number): string {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  return 'rate_limited';
}
