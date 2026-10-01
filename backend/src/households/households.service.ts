import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomInt } from 'node:crypto';
import { personalHouseholdName } from '../auth/auth.service.js';
import { DEFAULT_ACCOUNT, DEFAULT_CATEGORIES } from '../categories/default-categories.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DEMO_EMAIL, DEMO_PARTNER_EMAIL } from '../seed/demo-accounts.js';
import { HouseholdResponseDto, InviteResponseDto } from './dto/household.dto.js';

/** No 0/O, 1/I/L: codes are read aloud and typed on phones. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
const INVITE_TTL_MS = 48 * 60 * 60 * 1000;

type Tx = Prisma.TransactionClient;

export function hashInviteCode(code: string): string {
  return createHash('sha256').update(code.toUpperCase().replace(/[\s-]/g, '')).digest('hex');
}

export function generateInviteCode(): string {
  const raw = Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

@Injectable()
export class HouseholdsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<HouseholdResponseDto> {
    const membership = await this.prisma.householdMember.findUnique({
      where: { userId },
      include: {
        household: {
          include: {
            members: {
              include: { user: { select: { id: true, name: true, email: true } } },
              orderBy: { joinedAt: 'asc' },
            },
          },
        },
      },
    });
    if (!membership) throw new NotFoundException('Household not found');

    const { household } = membership;
    return {
      id: household.id,
      name: household.name,
      role: membership.role,
      members: household.members.map((m) => ({
        userId: m.user.id,
        name: m.user.name,
        email: m.user.email,
        role: m.role,
        joinedAt: m.joinedAt,
        isYou: m.userId === userId,
      })),
      invitesEnabled: !household.members.some((m) => isDemoEmail(m.user.email)),
    };
  }

  async rename(userId: string, name: string): Promise<HouseholdResponseDto> {
    const membership = await this.requireOwner(userId);
    await this.prisma.household.update({ where: { id: membership.householdId }, data: { name } });
    return this.get(userId);
  }

  async createInvite(userId: string): Promise<InviteResponseDto> {
    const membership = await this.requireOwner(userId);
    await this.assertNotDemoHousehold(membership.householdId);

    const code = generateInviteCode();
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    await this.prisma.householdInvite.create({
      data: {
        householdId: membership.householdId,
        createdById: userId,
        codeHash: hashInviteCode(code),
        expiresAt,
      },
    });
    return { code, expiresAt };
  }

  /**
   * Joins the household behind an invite code, bringing the user's personal
   * data along (categories with the same name and type are merged). The whole
   * operation is atomic: either everything moves or nothing does.
   */
  async join(userId: string, code: string): Promise<HouseholdResponseDto> {
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.householdMember.findUnique({
        where: { userId },
        include: { user: { select: { email: true } }, household: { include: { _count: { select: { members: true } } } } },
      });
      if (!current) throw new NotFoundException('Household not found');
      if (isDemoEmail(current.user.email)) {
        throw new ForbiddenException('The demo account cannot change households');
      }

      const invite = await tx.householdInvite.findUnique({ where: { codeHash: hashInviteCode(code) } });
      // One message for every failure: codes cannot be probed.
      if (!invite || invite.usedAt || invite.expiresAt <= new Date()) {
        throw new NotFoundException('Invalid or expired invite code');
      }
      if (invite.householdId === current.householdId) {
        throw new ConflictException('You are already a member of this household');
      }
      if (current.household._count.members > 1) {
        throw new ConflictException('Leave your current shared household before joining another one');
      }

      // Single use, claimed atomically (a concurrent join with the same code loses).
      const { count } = await tx.householdInvite.updateMany({
        where: { id: invite.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (count === 0) throw new NotFoundException('Invalid or expired invite code');

      await mergeHouseholdData(tx, current.householdId, invite.householdId);
      await tx.householdMember.update({
        where: { userId },
        data: { householdId: invite.householdId, role: 'MEMBER', joinedAt: new Date() },
      });
      await tx.household.delete({ where: { id: current.householdId } });
    });
    return this.get(userId);
  }

  /** Leaves a shared household; the user starts over in a new personal one. */
  async leave(userId: string): Promise<HouseholdResponseDto> {
    await this.prisma.$transaction(async (tx) => {
      const membership = await tx.householdMember.findUnique({
        where: { userId },
        include: { user: { select: { name: true, email: true } } },
      });
      if (!membership) throw new NotFoundException('Household not found');
      if (isDemoEmail(membership.user.email)) {
        throw new ForbiddenException('The demo account cannot change households');
      }

      const others = await tx.householdMember.findMany({
        where: { householdId: membership.householdId, userId: { not: userId } },
        orderBy: { joinedAt: 'asc' },
      });
      if (others.length === 0) {
        throw new ConflictException('You are the only member of this household');
      }
      // A household always keeps an owner: the longest-standing member inherits it.
      if (membership.role === 'OWNER') {
        await tx.householdMember.update({ where: { id: others[0].id }, data: { role: 'OWNER' } });
      }
      await moveToNewPersonalHousehold(tx, userId, membership.user.name);
    });
    return this.get(userId);
  }

  async removeMember(ownerId: string, memberUserId: string): Promise<HouseholdResponseDto> {
    if (ownerId === memberUserId) {
      throw new ConflictException('Use "leave" to leave your own household');
    }
    await this.prisma.$transaction(async (tx) => {
      const owner = await tx.householdMember.findUnique({ where: { userId: ownerId } });
      if (!owner || owner.role !== 'OWNER') {
        throw new ForbiddenException('Only the household owner can remove members');
      }
      const member = await tx.householdMember.findUnique({
        where: { userId: memberUserId },
        include: { user: { select: { name: true } } },
      });
      // Someone outside this household looks exactly like someone who doesn't exist.
      if (!member || member.householdId !== owner.householdId) {
        throw new NotFoundException('Member not found');
      }
      await moveToNewPersonalHousehold(tx, memberUserId, member.user.name);
    });
    return this.get(ownerId);
  }

  private async requireOwner(userId: string) {
    const membership = await this.prisma.householdMember.findUnique({ where: { userId } });
    if (!membership) throw new NotFoundException('Household not found');
    if (membership.role !== 'OWNER') {
      throw new ForbiddenException('Only the household owner can do this');
    }
    return membership;
  }

  private async assertNotDemoHousehold(householdId: string): Promise<void> {
    const demoMembers = await this.prisma.householdMember.count({
      where: { householdId, user: { email: { in: [DEMO_EMAIL, DEMO_PARTNER_EMAIL] } } },
    });
    if (demoMembers > 0) {
      throw new ForbiddenException('Invites are disabled on the public demo account');
    }
  }
}

function isDemoEmail(email: string): boolean {
  return email === DEMO_EMAIL || email === DEMO_PARTNER_EMAIL;
}

async function moveToNewPersonalHousehold(tx: Tx, userId: string, userName: string): Promise<void> {
  const household = await tx.household.create({
    data: {
      name: personalHouseholdName(userName),
      categories: { createMany: { data: [...DEFAULT_CATEGORIES] } },
      accounts: { create: { ...DEFAULT_ACCOUNT } },
    },
  });
  await tx.householdMember.update({
    where: { userId },
    data: { householdId: household.id, role: 'OWNER', joinedAt: new Date() },
  });
}

/**
 * Moves everything from `fromId` into `toId`.
 * - Categories: same name (case-insensitive) and type => merged into the
 *   target's; otherwise moved as they are.
 * - Budgets: if the target already budgets that category for that month, the
 *   target's budget wins and the incoming one is dropped.
 * - Accounts and transfers move as they are (two "Nubank" accounts can coexist).
 */
export async function mergeHouseholdData(tx: Tx, fromId: string, toId: string): Promise<void> {
  const [incoming, existing] = await Promise.all([
    tx.category.findMany({ where: { householdId: fromId } }),
    tx.category.findMany({ where: { householdId: toId } }),
  ]);
  const key = (c: { name: string; type: string }) => `${c.type}:${c.name.trim().toLowerCase()}`;
  const targetByKey = new Map(existing.map((c) => [key(c), c.id]));

  for (const category of incoming) {
    const targetId = targetByKey.get(key(category));
    if (!targetId) {
      await tx.category.update({ where: { id: category.id }, data: { householdId: toId } });
      continue;
    }
    await tx.transaction.updateMany({
      where: { householdId: fromId, categoryId: category.id },
      data: { categoryId: targetId },
    });
    // Rules reference categories with ON DELETE RESTRICT: re-point them first.
    await tx.recurringRule.updateMany({
      where: { householdId: fromId, categoryId: category.id },
      data: { categoryId: targetId },
    });
    const budgets = await tx.budget.findMany({ where: { householdId: fromId, categoryId: category.id } });
    for (const budget of budgets) {
      const clash = await tx.budget.findFirst({
        where: { householdId: toId, categoryId: targetId, year: budget.year, month: budget.month },
        select: { id: true },
      });
      if (clash) await tx.budget.delete({ where: { id: budget.id } });
      else await tx.budget.update({ where: { id: budget.id }, data: { categoryId: targetId, householdId: toId } });
    }
    await tx.category.delete({ where: { id: category.id } });
  }

  await tx.account.updateMany({ where: { householdId: fromId }, data: { householdId: toId } });
  await tx.transfer.updateMany({ where: { householdId: fromId }, data: { householdId: toId } });
  await tx.recurringRule.updateMany({ where: { householdId: fromId }, data: { householdId: toId } });
  await tx.transaction.updateMany({ where: { householdId: fromId }, data: { householdId: toId } });
  await tx.budget.updateMany({ where: { householdId: fromId }, data: { householdId: toId } });
}
