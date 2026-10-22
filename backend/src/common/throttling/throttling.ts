import { ExecutionContext, SetMetadata } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ThrottlerModuleOptions } from '@nestjs/throttler';

const CREDENTIALS_THROTTLE_KEY = 'throttle:credentials';

/**
 * Marks endpoints that accept a password (login, register). They get the
 * strict "credentials" limit on top of the global one, to slow down brute
 * force and credential stuffing.
 */
export const CredentialsThrottle = () => SetMetadata(CREDENTIALS_THROTTLE_KEY, true);

const isCredentialsEndpoint = (context: ExecutionContext) =>
  Reflect.getMetadata(CREDENTIALS_THROTTLE_KEY, context.getHandler()) === true;

/**
 * Two independent buckets, both keyed by client IP:
 * - `global`: generous limit on every route, so a single client cannot
 *   monopolize the API (answers 429 instead of degrading for everyone).
 * - `credentials`: e.g. 5 attempts / 15 min, only on @CredentialsThrottle routes.
 * - `ai`: per authenticated user, only enforced by AiThrottlerGuard on the AI
 *   routes (the global guard runs before authentication, so it always skips).
 */
export function throttlerOptions(config: ConfigService): ThrottlerModuleOptions {
  return {
    throttlers: [
      {
        name: 'global',
        ttl: 60_000,
        limit: config.get<number>('THROTTLE_GLOBAL_LIMIT', 300),
      },
      {
        name: 'credentials',
        ttl: config.get<number>('THROTTLE_AUTH_TTL_MINUTES', 15) * 60_000,
        limit: config.get<number>('THROTTLE_AUTH_LIMIT', 5),
        skipIf: (context) => !isCredentialsEndpoint(context),
      },
      {
        name: 'ai',
        ttl: 60_000,
        limit: config.get<number>('AI_USER_RPM', 10),
        skipIf: (context) => !context.switchToHttp().getRequest<{ user?: { id: string } }>().user,
        getTracker: (req: Record<string, any>) => `user:${(req.user as { id: string }).id}`,
      },
    ],
    errorMessage: 'Too many requests, please try again later',
  };
}
