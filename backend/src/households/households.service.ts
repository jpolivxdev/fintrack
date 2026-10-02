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

/**
 * Takes a member out of a shared household into a new personal one, with what
 * is theirs: the accounts they brought (and everything on them), the goals and
 * events they created, and the categories they use. Nothing is deleted.
 */
async function moveToNewPersonalHousehold(tx: Tx, userId: string, userName: string): Promise<void> {
  const membership = await tx.householdMember.findUniqueOrThrow({ where: { userId } });
  const household = await tx.household.create({ data: { name: personalHouseholdName(userName) } });
  await tx.householdMember.update({
    where: { userId },
    data: { householdId: household.id, role: 'OWNER', joinedAt: new Date() },
  });
  await splitHouseholdData(tx, userId, membership.householdId, household.id);

  // Nobody starts without the basics.
  const existing = await tx.category.findMany({ where: { householdId: household.id }, select: { name: true, type: true } });
  const has = new Set(existing.map((c) => `${c.type}:${c.name.trim().toLowerCase()}`));
  const missing = DEFAULT_CATEGORIES.filter((c) => !has.has(`${c.type}:${c.name.toLowerCase()}`));
  if (missing.length) {
    await tx.category.createMany({ data: missing.map((c) => ({ ...c, householdId: household.id, ownerId: userId })) });
  }
  if ((await tx.account.count({ where: { householdId: household.id, archived: false } })) === 0) {
    await tx.account.create({ data: { ...DEFAULT_ACCOUNT, householdId: household.id, ownerId: userId } });
  }
}

/** Finds a category by name and type in a household, creating it if needed. */
async function categoryIn(
  tx: Tx,
  householdId: string,
  like: { name: string; type: 'INCOME' | 'EXPENSE'; color?: string | null; icon?: string | null },
  ownerId: string | null,
): Promise<string> {
  const found = await tx.category.findFirst({
    where: { householdId, type: like.type, name: { equals: like.name, mode: 'insensitive' } },
    select: { id: true },
  });
  if (found) return found.id;
  const created = await tx.category.create({
    data: { householdId, ownerId, name: like.name, type: like.type, color: like.color ?? null, icon: like.icon ?? null },
  });
  return created.id;
}

export async function splitHouseholdData(tx: Tx, userId: string, fromId: string, toId: string): Promise<void> {
  // 1. Accounts the member brought, with their whole history.
  const accounts = await tx.account.findMany({ where: { householdId: fromId, ownerId: userId }, select: { id: true } });
  const mine = accounts.map((a) => a.id);
  const isMine = (id: string | null) => !!id && mine.includes(id);

  if (mine.length) {
    await tx.account.updateMany({ where: { id: { in: mine } }, data: { householdId: toId } });
    await tx.transaction.updateMany({ where: { householdId: fromId, accountId: { in: mine } }, data: { householdId: toId } });
    const investments = await tx.investment.findMany({ where: { accountId: { in: mine } }, select: { id: true } });
    await tx.investment.updateMany({ where: { accountId: { in: mine } }, data: { householdId: toId } });
    await tx.investmentValuation.updateMany({
      where: { investmentId: { in: investments.map((i) => i.id) } },
      data: { householdId: toId },
    });

    // Transfers: inside the member's accounts they move; between the member and
    // someone else they become a plain income/expense on each side, so both
    // balances stay right without one household pointing at the other's account.
    const transfers = await tx.transfer.findMany({
      where: { householdId: fromId, OR: [{ fromAccountId: { in: mine } }, { toAccountId: { in: mine } }] },
    });
    for (const t of transfers) {
      if (isMine(t.fromAccountId) && isMine(t.toAccountId)) {
        await tx.transfer.update({ where: { id: t.id }, data: { householdId: toId } });
        continue;
      }
      const outHousehold = isMine(t.fromAccountId) ? toId : fromId;
      const inHousehold = isMine(t.toAccountId) ? toId : fromId;
      const base = { amount: t.amount, date: t.date, description: t.description ?? 'Transferência', createdById: t.createdById };
      await tx.transaction.create({
        data: {
          ...base,
          householdId: outHousehold,
          accountId: t.fromAccountId,
          type: 'EXPENSE',
          categoryId: await categoryIn(tx, outHousehold, { name: 'Transferências', type: 'EXPENSE', icon: 'repeat' }, null),
        },
      });
      await tx.transaction.create({
        data: {
          ...base,
          householdId: inHousehold,
          accountId: t.toAccountId,
          type: 'INCOME',
          categoryId: await categoryIn(tx, inHousehold, { name: 'Transferências', type: 'INCOME', icon: 'repeat' }, null),
        },
      });
      await tx.transfer.delete({ where: { id: t.id } });
    }

    // Rules go with the paying account. A transfer rule between the two sides
    // is paused: its transfers would cross households.
    const rules = await tx.recurringRule.findMany({
      where: { householdId: fromId, OR: [{ accountId: { in: mine } }, { toAccountId: { in: mine } }] },
    });
    for (const r of rules) {
      const crosses = !!r.toAccountId && isMine(r.accountId) !== isMine(r.toAccountId);
      await tx.recurringRule.update({
        where: { id: r.id },
        data: { householdId: isMine(r.accountId) ? toId : fromId, active: crosses ? false : r.active },
      });
    }
  }

  // 2. What the member created that doesn't hang on an account.
  await tx.goal.updateMany({ where: { householdId: fromId, createdById: userId }, data: { householdId: toId } });
  await tx.calendarEvent.updateMany({ where: { householdId: fromId, createdById: userId }, data: { householdId: toId } });

  // 3. Categories. Moved entries still point at the shared household's
  // categories: the member's own unused-by-others ones move along; anything
  // still used on the other side is copied by name instead.
  const used = new Set<string>();
  for (const t of await tx.transaction.findMany({ where: { householdId: toId }, select: { categoryId: true } })) used.add(t.categoryId);
  for (const r of await tx.recurringRule.findMany({ where: { householdId: toId }, select: { categoryId: true } })) {
    if (r.categoryId) used.add(r.categoryId);
  }
  const owned = await tx.category.findMany({ where: { householdId: fromId, ownerId: userId }, select: { id: true } });
  const candidates = await tx.category.findMany({
    where: { householdId: fromId, id: { in: [...new Set([...used, ...owned.map((c) => c.id)])] } },
  });

  const copies: typeof candidates = [];
  for (const c of candidates) {
    const stillUsedThere =
      (await tx.transaction.count({ where: { householdId: fromId, categoryId: c.id } })) +
      (await tx.recurringRule.count({ where: { householdId: fromId, categoryId: c.id } }));
    if (c.ownerId === userId && stillUsedThere === 0) {
      await tx.category.update({ where: { id: c.id }, data: { householdId: toId } });
      await tx.budget.updateMany({ where: { householdId: fromId, categoryId: c.id }, data: { householdId: toId } });
    } else if (used.has(c.id)) {
      copies.push(c);
    }
  }
  // Copies after moves, so a moved category with the same name is reused.
  for (const c of copies) {
    const target = await categoryIn(tx, toId, c, userId);
    await tx.transaction.updateMany({ where: { householdId: toId, categoryId: c.id }, data: { categoryId: target } });
    await tx.recurringRule.updateMany({ where: { householdId: toId, categoryId: c.id }, data: { categoryId: target } });
  }
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
  await tx.goal.updateMany({ where: { householdId: fromId }, data: { householdId: toId } });
  await tx.investment.updateMany({ where: { householdId: fromId }, data: { householdId: toId } });
  await tx.investmentValuation.updateMany({ where: { householdId: fromId }, data: { householdId: toId } });
  // Private events stay private: visibility is per creator, not per household.
  await tx.calendarEvent.updateMany({ where: { householdId: fromId }, data: { householdId: toId } });
  await tx.transaction.updateMany({ where: { householdId: fromId }, data: { householdId: toId } });
  await tx.budget.updateMany({ where: { householdId: fromId }, data: { householdId: toId } });
}
