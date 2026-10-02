import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { generateInviteCode, hashInviteCode } from '../households/households.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DEMO_EMAIL, DEMO_PARTNER_EMAIL } from '../seed/demo-accounts.js';
import { CalendarPartnerDto, CalendarSharesDto } from './dto/calendar-share.dto.js';
import type { InviteResponseDto } from '../households/dto/household.dto.js';

const INVITE_TTL_MS = 48 * 60 * 60 * 1000;
/** Plenty for a couple or a family; keeps the visibility query small. */
const MAX_PARTNERS = 10;

const pair = (a: string, b: string) => (a < b ? { userAId: a, userBId: b } : { userAId: b, userBId: a });
const isDemo = (email: string) => email === DEMO_EMAIL || email === DEMO_PARTNER_EMAIL;

/**
 * Calendar sharing between people, independent of households: each one keeps
 * their own finances and only events marked as shared become visible.
 */
@Injectable()
export class CalendarSharesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Ids of the people whose shared events this user sees. */
  async partnerIds(userId: string): Promise<string[]> {
    const shares = await this.prisma.calendarShare.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
      select: { userAId: true, userBId: true },
    });
    return shares.map((s) => (s.userAId === userId ? s.userBId : s.userAId));
  }

  async list(userId: string): Promise<CalendarSharesDto> {
    const [user, shares] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } }),
      this.prisma.calendarShare.findMany({
        where: { OR: [{ userAId: userId }, { userBId: userId }] },
        include: {
          userA: { select: { id: true, name: true, email: true } },
          userB: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    const partners: CalendarPartnerDto[] = shares.map((s) => {
      const other = s.userAId === userId ? s.userB : s.userA;
      return { userId: other.id, name: other.name, email: other.email, since: s.createdAt };
    });
    return { partners, invitesEnabled: !isDemo(user.email) };
  }

  async createInvite(userId: string): Promise<InviteResponseDto> {
    await this.assertNotDemo(userId);
    const code = generateInviteCode();
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    await this.prisma.calendarInvite.create({ data: { createdById: userId, codeHash: hashInviteCode(code), expiresAt } });
    return { code, expiresAt };
  }

  async join(userId: string, code: string): Promise<CalendarSharesDto> {
    await this.assertNotDemo(userId);
    await this.prisma.$transaction(async (tx) => {
      const invite = await tx.calendarInvite.findUnique({ where: { codeHash: hashInviteCode(code) } });
      // One message for every failure: codes cannot be probed.
      if (!invite || invite.usedAt || invite.expiresAt <= new Date()) {
        throw new NotFoundException('Invalid or expired invite code');
      }
      if (invite.createdById === userId) throw new ConflictException('This is your own invite code');
      const ids = pair(userId, invite.createdById);
      if (await tx.calendarShare.findUnique({ where: { userAId_userBId: ids } })) {
        throw new ConflictException('You already share calendars with this person');
      }
      for (const id of [userId, invite.createdById]) {
        const count = await tx.calendarShare.count({ where: { OR: [{ userAId: id }, { userBId: id }] } });
        if (count >= MAX_PARTNERS) throw new ConflictException(`A calendar can be shared with at most ${MAX_PARTNERS} people`);
      }
      // Single use, claimed atomically (a concurrent join with the same code loses).
      const { count } = await tx.calendarInvite.updateMany({ where: { id: invite.id, usedAt: null }, data: { usedAt: new Date() } });
      if (count === 0) throw new NotFoundException('Invalid or expired invite code');
      await tx.calendarShare.create({ data: ids });
    });
    return this.list(userId);
  }

  /** Either side can stop sharing at any time. */
  async remove(userId: string, partnerId: string): Promise<CalendarSharesDto> {
    const { count } = await this.prisma.calendarShare.deleteMany({ where: pair(userId, partnerId) });
    if (count === 0) throw new NotFoundException('Calendar share not found');
    return this.list(userId);
  }

  private async assertNotDemo(userId: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
    if (isDemo(user.email)) {
      throw new ForbiddenException('Calendar sharing is disabled on the demo account, which is shared by every visitor');
    }
  }
}
