import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID } from 'node:crypto';
import { DEFAULT_ACCOUNT, DEFAULT_CATEGORIES } from '../categories/default-categories.js';
import type { User } from '../generated/prisma/client.js';
import { SecurityLogger } from '../common/logging/security-logger.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthResponseDto, UserResponseDto } from './dto/auth-response.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { JWT_ALGORITHM } from './auth.constants.js';

export interface AccessTokenPayload {
  sub: string;
  email: string;
}

export interface RefreshTokenPayload {
  sub: string;
  /** Id of the `refresh_tokens` row backing this token. */
  jti: string;
}

const INVALID_CREDENTIALS = 'Invalid email or password';

/** "Maria Silva" -> "Casa de Maria" */
export function personalHouseholdName(userName: string): string {
  return `Casa de ${userName.trim().split(/s+/)[0]}`;
}
const INVALID_REFRESH = 'Invalid or expired refresh token';

@Injectable()
export class AuthService {
  /**
   * Compared against when the email does not exist, so a login attempt takes
   * the same time whether or not the account exists (no user enumeration).
   */
  private readonly dummyHash: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly securityLogger: SecurityLogger,
  ) {
    // Same cost factor as real hashes, otherwise the timing would differ.
    this.dummyHash = bcrypt.hashSync('timing-attack-guard', this.saltRounds);
  }

  private get saltRounds(): number {
    return this.config.get<number>('BCRYPT_SALT_ROUNDS', 12);
  }

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, this.saltRounds);

    // Every account starts in its own household, with default categories.
    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        passwordHash,
        membership: {
          create: {
            role: 'OWNER',
            household: {
              create: {
                name: personalHouseholdName(dto.name),
                categories: { createMany: { data: [...DEFAULT_CATEGORIES] } },
                accounts: { create: { ...DEFAULT_ACCOUNT } },
              },
            },
          },
        },
      },
    });

    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    const passwordOk = await bcrypt.compare(
      dto.password,
      user?.passwordHash ?? this.dummyHash,
    );
    if (!user || !passwordOk) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    return this.buildAuthResponse(user);
  }

  /**
   * Refresh token rotation: each refresh token can be used exactly once.
   * Presenting an already-used token means it was probably stolen, so every
   * session of that user is revoked (reuse detection).
   */
  async refresh(refreshToken: string): Promise<AuthResponseDto> {
    const payload = await this.verifyRefreshToken(refreshToken);

    const stored = await this.prisma.refreshToken.findUnique({
      where: { id: payload.jti },
    });
    if (
      !stored ||
      stored.userId !== payload.sub ||
      stored.tokenHash !== this.hashToken(refreshToken)
    ) {
      throw new UnauthorizedException(INVALID_REFRESH);
    }
    if (stored.expiresAt <= new Date()) {
      throw new UnauthorizedException(INVALID_REFRESH);
    }

    // Atomically claim the token: only one concurrent request can succeed.
    const { count } = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) {
      this.securityLogger.refreshTokenReuse(stored.userId);
      await this.revokeAllSessions(stored.userId);
      throw new UnauthorizedException(INVALID_REFRESH);
    }

    const user = await this.prisma.user.findUnique({
      where: { id: stored.userId },
    });
    if (!user) throw new UnauthorizedException(INVALID_REFRESH);

    return this.buildAuthResponse(user);
  }

  /** Revokes the given refresh token. Idempotent: unknown tokens are ignored. */
  async logout(refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async me(userId: string): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return this.toUserResponse(user);
  }

  private async buildAuthResponse(user: User): Promise<AuthResponseDto> {
    const [accessToken, refreshToken] = await Promise.all([
      this.signAccessToken(user),
      this.createRefreshToken(user.id),
    ]);
    return { accessToken, refreshToken, user: this.toUserResponse(user) };
  }

  private signAccessToken(user: User): Promise<string> {
    const payload: AccessTokenPayload = { sub: user.id, email: user.email };
    return this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get('JWT_ACCESS_EXPIRES_IN', '15m'),
      algorithm: JWT_ALGORITHM,
    });
  }

  private async createRefreshToken(userId: string): Promise<string> {
    const days = this.config.get<number>('JWT_REFRESH_EXPIRES_IN_DAYS', 7);
    const id = randomUUID();
    const payload: RefreshTokenPayload = { sub: userId, jti: id };
    const token = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: `${days}d`,
      algorithm: JWT_ALGORITHM,
    });

    await this.prisma.refreshToken.create({
      data: {
        id,
        userId,
        tokenHash: this.hashToken(token),
        expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
      },
    });
    return token;
  }

  private async verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
    try {
      return await this.jwt.verifyAsync<RefreshTokenPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        algorithms: [JWT_ALGORITHM],
      });
    } catch {
      throw new UnauthorizedException(INVALID_REFRESH);
    }
  }

  private async revokeAllSessions(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Refresh tokens are long random JWTs, so a fast SHA-256 is enough (unlike
   * passwords, there is nothing to brute-force) and it allows indexed lookups.
   */
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private toUserResponse(user: User): UserResponseDto {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
    };
  }
}
