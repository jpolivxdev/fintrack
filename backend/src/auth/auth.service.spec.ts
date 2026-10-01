import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SecurityLogger } from '../common/logging/security-logger.js';
import { createPrismaMock, PrismaMock } from '../../test/utils/prisma-mock.js';
import { DEFAULT_CATEGORIES } from '../categories/default-categories.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthService } from './auth.service.js';

const CONFIG: Record<string, unknown> = {
  JWT_ACCESS_SECRET: 'test-access-secret-0123456789',
  JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789',
  JWT_ACCESS_EXPIRES_IN: '15m',
  JWT_REFRESH_EXPIRES_IN_DAYS: 7,
  BCRYPT_SALT_ROUNDS: 10,
};

const config = {
  get: (key: string, fallback?: unknown) => CONFIG[key] ?? fallback,
  getOrThrow: (key: string) => CONFIG[key],
} as unknown as ConfigService;

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

describe('AuthService', () => {
  let prisma: PrismaMock;
  let jwt: JwtService;
  let service: AuthService;
  let securityLogger: { refreshTokenReuse: ReturnType<typeof vi.fn> };

  const user = {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Maria',
    email: 'maria@example.com',
    passwordHash: bcrypt.hashSync('Secret123', 10),
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };

  beforeEach(() => {
    prisma = createPrismaMock();
    jwt = new JwtService({});
    securityLogger = { refreshTokenReuse: vi.fn() };
    service = new AuthService(
      prisma as unknown as PrismaService,
      jwt,
      config,
      securityLogger as unknown as SecurityLogger,
    );
    prisma.refreshToken.create.mockResolvedValue({});
  });

  describe('register', () => {
    it('hashes the password, seeds default categories and returns tokens', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockImplementation(({ data }) =>
        Promise.resolve({ ...user, email: data.email, passwordHash: data.passwordHash }),
      );

      const result = await service.register({
        name: 'Maria',
        email: 'maria@example.com',
        password: 'Secret123',
      });

      const { data } = prisma.user.create.mock.calls[0][0];
      expect(data.passwordHash).not.toBe('Secret123');
      expect(await bcrypt.compare('Secret123', data.passwordHash)).toBe(true);
      const household = data.membership.create.household.create;
      expect(data.membership.create.role).toBe('OWNER');
      expect(household.name).toBe('Casa de Maria');
      expect(household.categories.createMany.data).toHaveLength(DEFAULT_CATEGORIES.length);

      expect(result.user).toEqual({
        id: user.id,
        name: 'Maria',
        email: 'maria@example.com',
        createdAt: user.createdAt,
      });
      expect(result.user).not.toHaveProperty('passwordHash');
      expect(result.accessToken).toEqual(expect.any(String));
      expect(result.refreshToken).toEqual(expect.any(String));
    });

    it('stores only the hash of the refresh token', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(user);

      const { refreshToken } = await service.register({
        name: 'Maria',
        email: user.email,
        password: 'Secret123',
      });

      const { data } = prisma.refreshToken.create.mock.calls[0][0];
      expect(data.tokenHash).toBe(sha256(refreshToken));
      expect(data.tokenHash).not.toBe(refreshToken);
      expect(data.userId).toBe(user.id);
    });

    it('rejects an email that is already registered', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: user.id });

      await expect(
        service.register({ name: 'X', email: user.email, password: 'Secret123' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('returns tokens with a valid access token payload', async () => {
      prisma.user.findUnique.mockResolvedValue(user);

      const result = await service.login({ email: user.email, password: 'Secret123' });

      const payload = await jwt.verifyAsync(result.accessToken, {
        secret: CONFIG.JWT_ACCESS_SECRET as string,
      });
      expect(payload).toMatchObject({ sub: user.id, email: user.email });
      // 15 minutes
      expect(payload.exp - payload.iat).toBe(15 * 60);
    });

    it('rejects a wrong password', async () => {
      prisma.user.findUnique.mockResolvedValue(user);

      await expect(
        service.login({ email: user.email, password: 'wrong-pass1' }),
      ).rejects.toThrow(new UnauthorizedException('Invalid email or password'));
    });

    it('rejects an unknown email with the same message (no user enumeration)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@example.com', password: 'Secret123' }),
      ).rejects.toThrow(new UnauthorizedException('Invalid email or password'));
    });
  });

  describe('refresh', () => {
    async function issueRefreshToken() {
      prisma.user.findUnique.mockResolvedValue(user);
      const { refreshToken } = await service.login({
        email: user.email,
        password: 'Secret123',
      });
      const row = prisma.refreshToken.create.mock.calls[0][0].data;
      return { refreshToken, row: { ...row, revokedAt: null } };
    }

    it('rotates the token: revokes the old one and issues a new pair', async () => {
      const { refreshToken, row } = await issueRefreshToken();
      prisma.refreshToken.findUnique.mockResolvedValue(row);
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.refresh(refreshToken);

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { id: row.id, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(result.refreshToken).not.toBe(refreshToken);
      expect(prisma.refreshToken.create).toHaveBeenCalledTimes(2);
    });

    it('revokes every session when a used token is presented again', async () => {
      const { refreshToken, row } = await issueRefreshToken();
      prisma.refreshToken.findUnique.mockResolvedValue({ ...row, revokedAt: new Date() });
      prisma.refreshToken.updateMany
        .mockResolvedValueOnce({ count: 0 }) // claim fails: already used
        .mockResolvedValueOnce({ count: 3 }); // revoke all

      await expect(service.refresh(refreshToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(securityLogger.refreshTokenReuse).toHaveBeenCalledWith(user.id);
      expect(prisma.refreshToken.updateMany).toHaveBeenLastCalledWith({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('rejects a token whose hash does not match the stored one', async () => {
      const { refreshToken, row } = await issueRefreshToken();
      prisma.refreshToken.findUnique.mockResolvedValue({ ...row, tokenHash: 'other' });

      await expect(service.refresh(refreshToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects an expired session', async () => {
      const { refreshToken, row } = await issueRefreshToken();
      prisma.refreshToken.findUnique.mockResolvedValue({
        ...row,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(service.refresh(refreshToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects a token signed with another secret', async () => {
      const forged = await jwt.signAsync(
        { sub: user.id, jti: 'x' },
        { secret: 'attacker-secret-0123456789' },
      );

      await expect(service.refresh(forged)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prisma.refreshToken.findUnique).not.toHaveBeenCalled();
    });

    it('rejects an access token used as a refresh token', async () => {
      prisma.user.findUnique.mockResolvedValue(user);
      const { accessToken } = await service.login({
        email: user.email,
        password: 'Secret123',
      });

      await expect(service.refresh(accessToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it('revokes the session matching the token hash', async () => {
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      await service.logout('some.refresh.token');

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { tokenHash: sha256('some.refresh.token'), revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });
});
