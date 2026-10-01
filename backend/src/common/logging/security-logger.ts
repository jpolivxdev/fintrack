import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { Request } from 'express';

declare module 'express-serve-static-core' {
  interface Request {
    /** Set when a richer audit line was already written for this request. */
    securityAudited?: boolean;
  }
}

/** Status codes worth an audit line: auth failures, access denials, throttling. */
const SECURITY_STATUSES = new Map<number, string>([
  [401, 'unauthorized'],
  [403, 'forbidden'],
  [429, 'rate_limited'],
]);

const WINDOW_MS = 60_000;
/** Upper bound on tracked (event, ip) pairs, so many IPs cannot exhaust memory. */
const MAX_TRACKED = 10_000;

interface WindowState {
  windowStart: number;
  suppressed: number;
  last: Record<string, unknown>;
}

/**
 * Structured security audit log.
 * - Never logs bodies, passwords, tokens or Authorization headers.
 * - Repeated events from the same IP are aggregated: the first one in each
 *   60 s window is logged immediately, the rest are counted and reported as
 *   `suppressed` when the window closes (an attacker cannot flood the logs).
 */
@Injectable()
export class SecurityLogger implements OnModuleDestroy {
  private readonly logger = new Logger('Security');
  private readonly windows = new Map<string, WindowState>();
  private readonly flushTimer = setInterval(() => this.flush(), WINDOW_MS).unref();

  logClientError(request: Request, statusCode: number): void {
    const event = SECURITY_STATUSES.get(statusCode);
    if (!event || request.securityAudited) return;
    this.aggregate(event, {
      event,
      status: statusCode,
      method: request.method,
      path: request.path,
      ip: request.ip,
      userId: (request.user as { id?: string } | undefined)?.id,
      requestId: request.requestId,
    });
  }

  /** Always logged (volume is already bounded by the login rate limit). */
  loginFailed(request: Request, email: string): void {
    request.securityAudited = true;
    this.logger.warn({
      event: 'login_failed',
      email: maskEmail(email),
      ip: request.ip,
      requestId: request.requestId,
    });
  }

  /** A rotated refresh token was presented again: likely stolen. */
  refreshTokenReuse(userId: string): void {
    this.logger.error({ event: 'refresh_token_reuse_detected', userId, action: 'all_sessions_revoked' });
  }

  onModuleDestroy(): void {
    clearInterval(this.flushTimer);
    this.flush(Number.POSITIVE_INFINITY);
  }

  private aggregate(event: string, entry: Record<string, unknown>): void {
    const key = `${event}:${entry.ip}`;
    const now = Date.now();
    const state = this.windows.get(key);

    if (state && now - state.windowStart < WINDOW_MS) {
      state.suppressed += 1;
      state.last = entry;
      return;
    }
    if (state) this.reportSuppressed(state);
    if (this.windows.size >= MAX_TRACKED) this.flush(Number.POSITIVE_INFINITY);

    this.windows.set(key, { windowStart: now, suppressed: 0, last: entry });
    this.logger.warn(entry);
  }

  /** Closes windows older than `maxAge` and reports what they suppressed. */
  private flush(maxAge = WINDOW_MS): void {
    const now = Date.now();
    for (const [key, state] of this.windows) {
      if (now - state.windowStart >= maxAge || maxAge === Number.POSITIVE_INFINITY) {
        this.reportSuppressed(state);
        this.windows.delete(key);
      }
    }
  }

  private reportSuppressed(state: WindowState): void {
    if (state.suppressed === 0) return;
    const { event, ip, path } = state.last;
    this.logger.warn({
      event: `${String(event)}_aggregated`,
      ip,
      lastPath: path,
      suppressed: state.suppressed,
      windowSeconds: WINDOW_MS / 1000,
    });
  }
}

/** "maria.silva@example.com" -> "ma***@example.com" */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  return `${local.slice(0, 2)}***@${domain}`;
}
