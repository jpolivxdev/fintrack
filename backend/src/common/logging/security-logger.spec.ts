import { Logger } from '@nestjs/common';
import type { Request } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { maskEmail, SecurityLogger } from './security-logger.js';

const request = (ip: string, extra: Partial<Request> = {}) =>
  ({
    method: 'GET',
    path: '/api/transactions',
    ip,
    requestId: 'req-1',
    headers: { authorization: 'Bearer secret-token' },
    body: { password: 'hunter2' },
    ...extra,
  }) as unknown as Request;

describe('SecurityLogger', () => {
  let logger: SecurityLogger;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    logger = new SecurityLogger();
  });

  afterEach(() => {
    logger.onModuleDestroy();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('logs 401/403/429 with context but no secrets', () => {
    logger.logClientError(request('1.1.1.1'), 401);

    expect(warn).toHaveBeenCalledTimes(1);
    const entry = warn.mock.calls[0][0];
    expect(entry).toMatchObject({ event: 'unauthorized', status: 401, ip: '1.1.1.1', path: '/api/transactions' });
    expect(JSON.stringify(entry)).not.toMatch(/hunter2|secret-token/);
  });

  it('ignores other client errors', () => {
    logger.logClientError(request('1.1.1.1'), 400);
    logger.logClientError(request('1.1.1.1'), 404);
    expect(warn).not.toHaveBeenCalled();
  });

  it('aggregates a flood from one IP into one line plus a summary', () => {
    for (let i = 0; i < 10_000; i++) logger.logClientError(request('6.6.6.6'), 429);
    expect(warn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(60_000);

    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[1][0]).toMatchObject({
      event: 'rate_limited_aggregated',
      ip: '6.6.6.6',
      suppressed: 9_999,
    });
  });

  it('keeps logging distinct IPs separately', () => {
    logger.logClientError(request('1.1.1.1'), 429);
    logger.logClientError(request('2.2.2.2'), 429);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('does not double-log a request that already has a richer audit line', () => {
    const req = request('1.1.1.1');
    logger.loginFailed(req, 'maria@example.com');
    logger.logClientError(req, 401);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatchObject({ event: 'login_failed', email: 'ma***@example.com' });
  });

  it('bounds memory when many IPs are tracked', () => {
    for (let i = 0; i < 25_000; i++) logger.logClientError(request(`10.0.${i >> 8}.${i & 255}`), 429);
    expect((logger as unknown as { windows: Map<string, unknown> }).windows.size).toBeLessThanOrEqual(10_000);
  });
});

describe('maskEmail', () => {
  it('keeps only the first two characters of the local part', () => {
    expect(maskEmail('maria.silva@example.com')).toBe('ma***@example.com');
    expect(maskEmail('a@b.dev')).toBe('a***@b.dev');
    expect(maskEmail('not-an-email')).toBe('***');
  });
});
