import { describe, expect, it } from 'vitest';
import { quotaDay } from './ai-gateway.service.js';

describe('quotaDay', () => {
  it('follows the provider reset at midnight Pacific time, not UTC', () => {
    // 06:59 UTC on Oct 22 is still Oct 21 in Los Angeles (UTC-7 in October)...
    expect(quotaDay(new Date('2026-10-22T06:59:00Z')).toISOString()).toBe('2026-10-21T00:00:00.000Z');
    // ...and 07:00 UTC is the new quota day.
    expect(quotaDay(new Date('2026-10-22T07:00:00Z')).toISOString()).toBe('2026-10-22T00:00:00.000Z');
    // In winter Pacific is UTC-8.
    expect(quotaDay(new Date('2026-12-15T07:30:00Z')).toISOString()).toBe('2026-12-14T00:00:00.000Z');
  });
});
