import { plainToInstance, Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

/**
 * Every environment variable the app depends on. The app refuses to boot if
 * one is missing or malformed, instead of failing later at runtime.
 */
export class EnvironmentVariables {
  @IsIn(['development', 'production', 'test'])
  NODE_ENV: 'development' | 'production' | 'test' = 'development';

  @Type(() => Number)
  @IsInt()
  PORT = 3000;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;

  @IsString()
  @IsOptional()
  CORS_ORIGINS?: string;

  /** At least 32 chars (>= 256 bits when random). Generate with `openssl rand -hex 48`. */
  @IsString()
  @MinLength(32)
  JWT_ACCESS_SECRET: string;

  @IsString()
  JWT_ACCESS_EXPIRES_IN = '15m';

  @IsString()
  @MinLength(32)
  JWT_REFRESH_SECRET: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  JWT_REFRESH_EXPIRES_IN_DAYS = 7;

  @Type(() => Number)
  @IsInt()
  @Min(12)
  @Max(15)
  BCRYPT_SALT_ROUNDS = 12;

  /** Login/register attempts allowed per IP in each THROTTLE_AUTH_TTL_MINUTES window. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  THROTTLE_AUTH_LIMIT = 5;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  THROTTLE_AUTH_TTL_MINUTES = 15;

  /** Requests per IP per minute on every other route. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  THROTTLE_GLOBAL_LIMIT = 300;

  /**
   * Number of reverse proxies in front of the app (Render = 1). Needed so the
   * rate limiter sees the client IP; 0 means X-Forwarded-For is ignored.
   */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  TRUST_PROXY_HOPS = 0;

  /** Public URL of the web app, used in e-mailed links (never taken from the request). */
  @IsOptional()
  @IsUrl({ require_tld: false, protocols: ['http', 'https'], require_protocol: true })
  APP_URL?: string;

  /** Brevo (transactional e-mail) API key. Without it, password reset is off in production. */
  @IsOptional()
  @IsString()
  BREVO_API_KEY?: string;

  /** Verified sender address in Brevo. */
  @IsOptional()
  @IsEmail()
  MAIL_FROM?: string;
}

export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    exposeDefaultValues: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    const details = errors
      .map(
        (e) =>
          `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`,
      )
      .join('\n');
    throw new Error(`Invalid environment variables:\n${details}`);
  }
  // A leaked refresh secret must not let anyone mint access tokens (and vice versa).
  if (validated.JWT_ACCESS_SECRET === validated.JWT_REFRESH_SECRET) {
    throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different');
  }
  if (
    validated.NODE_ENV === 'production' &&
    /change-me/i.test(validated.JWT_ACCESS_SECRET + validated.JWT_REFRESH_SECRET)
  ) {
    throw new Error('Placeholder JWT secrets are not allowed in production');
  }
  if (validated.CORS_ORIGINS?.split(',').some((o) => o.trim() === '*')) {
    throw new Error('CORS_ORIGINS must list explicit origins, wildcards are not allowed');
  }
  return validated;
}
