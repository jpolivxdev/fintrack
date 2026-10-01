import { plainToInstance, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
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

  @IsString()
  @MinLength(16)
  JWT_ACCESS_SECRET: string;

  @IsString()
  JWT_ACCESS_EXPIRES_IN = '15m';

  @IsString()
  @MinLength(16)
  JWT_REFRESH_SECRET: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  JWT_REFRESH_EXPIRES_IN_DAYS = 7;

  @Type(() => Number)
  @IsInt()
  @Min(10)
  @Max(15)
  BCRYPT_SALT_ROUNDS = 12;

  /** Max auth requests per IP per minute (login/register brute-force protection). */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  THROTTLE_AUTH_LIMIT = 10;
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
  return validated;
}
