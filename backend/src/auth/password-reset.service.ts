import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import { MAILER, type Mailer } from '../mail/mailer.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DEMO_EMAIL, DEMO_PARTNER_EMAIL } from '../seed/demo-accounts.js';

const TOKEN_TTL_MS = 30 * 60 * 1000;
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * "Forgot my password": a one-time link valid for 30 minutes. The response
 * never reveals whether the e-mail exists, the link is never logged in
 * production, and resetting signs out every session.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(MAILER) private readonly mailer: Mailer,
  ) {}

  get enabled(): boolean {
    return this.mailer.enabled;
  }

  /** Always resolves the same way; the e-mail goes out in the background. */
  async request(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email }, select: { id: true, name: true, email: true } });
    if (!user || !this.mailer.enabled || email === DEMO_EMAIL || email === DEMO_PARTNER_EMAIL) return;

    const token = randomBytes(32).toString('base64url');
    await this.prisma.$transaction([
      // Only the newest link works.
      this.prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } }),
      this.prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash: hash(token), expiresAt: new Date(Date.now() + TOKEN_TTL_MS) },
      }),
    ]);

    // The fragment (#) never reaches servers, proxies or Referer headers.
    const link = `${this.appUrl()}/redefinir-senha#token=${token}`;
    const firstName = user.name.split(' ')[0];
    // Not awaited: response time must not depend on whether the account exists.
    void this.mailer
      .send({
        to: user.email,
        toName: user.name,
        subject: 'Redefinir sua senha do FinTrack',
        text: `Olá, ${firstName}!\n\nPara criar uma nova senha, abra este link (vale por 30 minutos e funciona uma vez):\n${link}\n\nSe não foi você que pediu, ignore este e-mail: sua senha continua a mesma.`,
        html: `<p>Olá, ${escapeHtml(firstName)}!</p><p>Para criar uma nova senha, toque no botão abaixo. O link vale por <strong>30 minutos</strong> e funciona uma vez.</p><p><a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#6d28d9;color:#fff;text-decoration:none;font-weight:600">Criar nova senha</a></p><p style="color:#666;font-size:13px">Se não foi você que pediu, ignore este e-mail: sua senha continua a mesma.</p>`,
      })
      .catch((error: unknown) => {
        this.logger.error(`Password reset e-mail failed: ${error instanceof Error ? error.message : String(error)}`);
      });
  }

  async reset(token: string, password: string): Promise<void> {
    const stored = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash: hash(token) } });
    if (!stored || stored.usedAt || stored.expiresAt <= new Date()) {
      throw new BadRequestException('Invalid or expired reset link');
    }
    const passwordHash = await bcrypt.hash(password, this.config.get<number>('BCRYPT_SALT_ROUNDS', 12));
    await this.prisma.$transaction(async (tx) => {
      // Single use, claimed atomically.
      const { count } = await tx.passwordResetToken.updateMany({
        where: { id: stored.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (count === 0) throw new BadRequestException('Invalid or expired reset link');
      await tx.user.update({ where: { id: stored.userId }, data: { passwordHash } });
      // Whoever had the old password (or a stolen session) is signed out.
      await tx.refreshToken.updateMany({ where: { userId: stored.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.passwordResetToken.deleteMany({ where: { userId: stored.userId, usedAt: null } });
    });
  }

  private appUrl(): string {
    const configured = this.config.get<string>('APP_URL');
    const fromCors = this.config.get<string>('CORS_ORIGINS')?.split(',')[0]?.trim();
    return (configured ?? fromCors ?? 'http://localhost:5173').replace(/\/+$/, '');
  }
}
