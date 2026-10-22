import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { AI_PROVIDER, AiProviderError, type AiFailureReason, type AiProvider, type AiUsage } from './providers/ai-provider.js';

/** Why the AI is not answering this time: every caller has a non-AI fallback for these. */
export type AiUnavailableReason =
  | AiFailureReason
  | 'disabled' // AI_ENABLED=false (kill switch)
  | 'not_opted_in' // the user didn't turn AI on
  | 'paused' // circuit breaker open (failures or daily quota)
  | 'user_quota' // this user's daily quota
  | 'global_quota' // the whole app's daily budget
  | 'global_rate'; // the whole app's per-minute budget

export class AiUnavailableError extends Error {
  constructor(readonly reason: AiUnavailableReason) {
    super(`AI unavailable: ${reason}`);
    this.name = 'AiUnavailableError';
  }
}

/** Worth one more try: transient provider trouble, or an answer that failed validation. */
const RETRYABLE = new Set<AiFailureReason>(['rate_limited', 'timeout', 'unavailable', 'invalid_output']);
/** Provider health problems. Bad or blocked answers don't count: users can provoke those, and must not be able to pause the AI for everyone. */
const BREAKER_FAILURES = new Set<AiFailureReason>(['rate_limited', 'timeout', 'unavailable']);
const FAILURES_TO_OPEN = 3;
const BREAKER_PAUSE_MS = 5 * 60_000;

/** The provider's quota day (Gemini's free tier resets at midnight Pacific time). */
export function quotaDay(now = new Date()): Date {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return new Date(`${ymd}T00:00:00.000Z`);
}

/** Next midnight in Pacific time, as an instant (approximate within the DST hour). */
function nextPacificMidnight(now = new Date()): number {
  const day = quotaDay(now);
  // Pacific is UTC-8 or UTC-7: try both and take the first instant that is in the future and starts a new day.
  for (const offset of [7, 8]) {
    const candidate = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() + 1, offset);
    if (candidate > now.getTime() && quotaDay(new Date(candidate)).getTime() !== day.getTime()) return candidate;
  }
  return now.getTime() + 24 * 3600_000;
}

/**
 * Single door to the AI provider. Before a call: kill switch, opt-in, circuit
 * breaker, per-user daily quota, app-wide daily and per-minute budgets (the
 * free tier is shared by every user of the project). During a call: timeout and
 * at most one retry with backoff, only for retryable failures. After: usage
 * recorded and one metadata log line (never the user's text, never the key).
 */
@Injectable()
export class AiGateway {
  private readonly logger = new Logger('AI');
  private disabledReason: AiFailureReason | null = null;
  private pausedUntil = 0;
  private consecutiveFailures = 0;
  private readonly minuteWindow: number[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(AI_PROVIDER) private readonly provider: AiProvider,
  ) {}

  get providerName(): string {
    return this.provider.name;
  }

  get model(): string {
    return this.provider.model;
  }

  /** Whether the server can use AI at all right now (independent of the user). */
  serverStatus(): { available: boolean; reason?: AiUnavailableReason } {
    if (!this.config.get<boolean>('AI_ENABLED')) return { available: false, reason: 'disabled' };
    if (this.disabledReason) return { available: false, reason: this.disabledReason };
    if (Date.now() < this.pausedUntil) return { available: false, reason: 'paused' };
    return { available: true };
  }

  async optedIn(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { aiEnabled: true } });
    return user?.aiEnabled === true;
  }

  /**
   * Runs one AI operation. `operation` receives the provider and an abort
   * signal and must return the provider's usage alongside its result.
   */
  async run<T>(userId: string, feature: string, operation: (provider: AiProvider, signal: AbortSignal) => Promise<T & { usage: AiUsage }>): Promise<T> {
    const status = this.serverStatus();
    if (!status.available) throw this.unavailable(userId, feature, status.reason!);
    if (!(await this.optedIn(userId))) throw new AiUnavailableError('not_opted_in');

    for (let attempt = 1; attempt <= 2; attempt++) {
      await this.reserve(userId, feature);
      const started = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.config.get<number>('AI_TIMEOUT_MS', 10_000));
      try {
        const result = await operation(this.provider, controller.signal);
        this.consecutiveFailures = 0;
        await this.recordTokens(userId, result.usage);
        this.log({ event: 'ai_call', feature, outcome: 'ok', attempt, latencyMs: Date.now() - started, ...result.usage, userId });
        return result;
      } catch (error) {
        const reason = error instanceof AiProviderError ? error.reason : controller.signal.aborted ? 'timeout' : 'unavailable';
        this.log({ event: 'ai_call', feature, outcome: reason, attempt, latencyMs: Date.now() - started, userId }, 'warn');
        this.onFailure(reason);
        if (attempt === 1 && RETRYABLE.has(reason) && this.serverStatus().available) {
          await new Promise((r) => setTimeout(r, 400 + Math.floor(Math.random() * 400)));
          continue;
        }
        throw new AiUnavailableError(reason);
      } finally {
        clearTimeout(timer);
      }
    }
    throw new AiUnavailableError('unavailable');
  }

  /** Requests this user made in the current quota day, and the daily limit. */
  async usageToday(userId: string): Promise<{ used: number; quota: number }> {
    const row = await this.prisma.aiUsage.findUnique({ where: { userId_day: { userId, day: quotaDay() } }, select: { requests: true } });
    return { used: row?.requests ?? 0, quota: this.config.get<number>('AI_USER_DAILY_QUOTA', 30) };
  }

  /** Security-relevant events (rejected output, unknown tool...) for abuse detection. */
  securityEvent(userId: string, feature: string, kind: string): void {
    this.log({ event: 'ai_security', feature, kind, userId }, 'warn');
  }

  /** Test helper: forget breaker/limiter state. */
  reset(): void {
    this.disabledReason = null;
    this.pausedUntil = 0;
    this.consecutiveFailures = 0;
    this.minuteWindow.length = 0;
  }

  /** Checks the budgets and counts the attempt before it happens, so it can't be bypassed. */
  private async reserve(userId: string, feature: string): Promise<void> {
    const now = Date.now();
    while (this.minuteWindow.length && this.minuteWindow[0] <= now - 60_000) this.minuteWindow.shift();
    if (this.minuteWindow.length >= this.config.get<number>('AI_GLOBAL_RPM', 10)) throw this.unavailable(userId, feature, 'global_rate');

    const day = quotaDay();
    const [mine, all] = await Promise.all([
      this.prisma.aiUsage.findUnique({ where: { userId_day: { userId, day } }, select: { requests: true } }),
      this.prisma.aiUsage.aggregate({ where: { day }, _sum: { requests: true } }),
    ]);
    if ((mine?.requests ?? 0) >= this.config.get<number>('AI_USER_DAILY_QUOTA', 30)) throw this.unavailable(userId, feature, 'user_quota');
    if ((all._sum.requests ?? 0) >= this.config.get<number>('AI_GLOBAL_RPD', 200)) throw this.unavailable(userId, feature, 'global_quota');

    this.minuteWindow.push(now);
    await this.prisma.aiUsage.upsert({
      where: { userId_day: { userId, day } },
      create: { userId, day, requests: 1 },
      update: { requests: { increment: 1 } },
    });
  }

  private async recordTokens(userId: string, usage: AiUsage): Promise<void> {
    await this.prisma.aiUsage.update({
      where: { userId_day: { userId, day: quotaDay() } },
      data: { inputTokens: { increment: usage.inputTokens }, outputTokens: { increment: usage.outputTokens } },
    });
  }

  private onFailure(reason: AiFailureReason): void {
    if (reason === 'daily_quota') {
      this.pausedUntil = nextPacificMidnight();
    } else if (reason === 'no_quota' || reason === 'auth') {
      // Never keep hammering a provider that said no: off until someone fixes the config.
      this.disabledReason = reason;
    } else if (BREAKER_FAILURES.has(reason) && ++this.consecutiveFailures >= FAILURES_TO_OPEN) {
      this.pausedUntil = Date.now() + BREAKER_PAUSE_MS;
      this.consecutiveFailures = 0;
    }
  }

  private unavailable(userId: string, feature: string, reason: AiUnavailableReason): AiUnavailableError {
    if (reason === 'user_quota' || reason === 'global_quota' || reason === 'global_rate') {
      this.log({ event: 'ai_security', feature, kind: `limit_${reason}`, userId }, 'warn');
    }
    return new AiUnavailableError(reason);
  }

  private log(entry: Record<string, unknown>, level: 'log' | 'warn' = 'log'): void {
    const line = JSON.stringify({ ...entry, provider: this.provider.name, model: this.provider.model });
    if (level === 'warn') this.logger.warn(line);
    else this.logger.log(line);
  }
}
