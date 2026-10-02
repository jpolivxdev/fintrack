import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { formatDateOnly, parseDateOnly } from '../common/utils/date.js';
import { toDecimal } from '../common/utils/money.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DEMO_EMAIL, DEMO_PARTNER_EMAIL } from '../seed/demo-accounts.js';
import type { BackupFileDto, RestoreResultDto } from './dto/backup.dto.js';

const num = (d: { toNumber(): number }) => d.toNumber();
const day = (d: Date) => formatDateOnly(d);
const optDay = (d: Date | null) => (d ? formatDateOnly(d) : null);

/**
 * Whole-household backup: everything needed to rebuild the same picture on
 * another FinTrack (e.g. moving from a local install to the hosted one).
 * Ids from the file are only references inside the file; restore creates new
 * ids and every row belongs to the restoring user's household.
 */
@Injectable()
export class BackupService {
  constructor(private readonly prisma: PrismaService) {}

  async export(user: AuthUser): Promise<BackupFileDto> {
    const householdId = user.householdId;
    const [me, accounts, categories, transactions, transfers, recurring, budgets, goals, investments, events] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { name: true } }),
      this.prisma.account.findMany({ where: { householdId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.category.findMany({ where: { householdId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.transaction.findMany({ where: { householdId }, orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] }),
      this.prisma.transfer.findMany({ where: { householdId }, orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] }),
      this.prisma.recurringRule.findMany({ where: { householdId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.budget.findMany({ where: { householdId } }),
      this.prisma.goal.findMany({ where: { householdId }, include: { contributions: { orderBy: { date: 'asc' } } } }),
      this.prisma.investment.findMany({ where: { householdId }, include: { valuations: { orderBy: { date: 'asc' } } } }),
      // Other members' private events are not ours to export.
      this.prisma.calendarEvent.findMany({
        where: { householdId, OR: [{ visibility: 'SHARED' }, { createdById: user.id }] },
        orderBy: { startAt: 'asc' },
      }),
    ]);

    return {
      kind: 'fintrack-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      exportedBy: me.name,
      accounts: accounts.map((a) => ({
        ref: a.id,
        name: a.name,
        type: a.type,
        color: a.color,
        icon: a.icon,
        initialBalance: num(a.initialBalance),
        archived: a.archived,
      })),
      categories: categories.map((c) => ({ ref: c.id, name: c.name, type: c.type, color: c.color, icon: c.icon })),
      transactions: transactions.map((t) => ({
        accountRef: t.accountId,
        categoryRef: t.categoryId,
        type: t.type,
        description: t.description,
        amount: num(t.amount),
        date: day(t.date),
        notes: t.notes,
        installmentGroupRef: t.installmentGroupId,
        installmentNumber: t.installmentNumber,
        installmentTotal: t.installmentTotal,
        recurringRef: t.recurringRuleId,
        externalId: t.externalId,
      })),
      transfers: transfers.map((t) => ({
        fromAccountRef: t.fromAccountId,
        toAccountRef: t.toAccountId,
        amount: num(t.amount),
        date: day(t.date),
        description: t.description,
        recurringRef: t.recurringRuleId,
      })),
      recurring: recurring.map((r) => ({
        ref: r.id,
        description: r.description,
        amount: num(r.amount),
        type: r.type,
        frequency: r.frequency,
        categoryRef: r.categoryId,
        accountRef: r.accountId,
        toAccountRef: r.toAccountId,
        notes: r.notes,
        startDate: day(r.startDate),
        endDate: optDay(r.endDate),
        nextRunDate: day(r.nextRunDate),
        active: r.active,
      })),
      budgets: budgets.map((b) => ({ categoryRef: b.categoryId, year: b.year, month: b.month, monthlyLimit: num(b.monthlyLimit) })),
      goals: goals.map((g) => ({
        name: g.name,
        targetAmount: num(g.targetAmount),
        targetDate: optDay(g.targetDate),
        color: g.color,
        icon: g.icon,
        archived: g.archived,
        contributions: g.contributions.map((c) => ({ amount: num(c.amount), date: day(c.date), note: c.note })),
      })),
      investments: investments.map((i) => ({
        accountRef: i.accountId,
        assetClass: i.assetClass,
        yieldMode: i.yieldMode,
        rate: i.rate ? num(i.rate) : null,
        startDate: day(i.startDate),
        maturityDate: optDay(i.maturityDate),
        valuations: i.valuations.map((v) => ({ date: day(v.date), value: num(v.value) })),
      })),
      events: events.map((e) => ({
        title: e.title,
        description: e.description,
        location: e.location,
        startAt: e.startAt.toISOString(),
        endAt: e.endAt.toISOString(),
        allDay: e.allDay,
        visibility: e.visibility,
        color: e.color,
        estimatedCost: e.estimatedCost ? num(e.estimatedCost) : null,
      })),
    };
  }

  async restore(user: AuthUser, file: BackupFileDto): Promise<RestoreResultDto> {
    const me = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { email: true } });
    if (me.email === DEMO_EMAIL || me.email === DEMO_PARTNER_EMAIL) {
      throw new ForbiddenException('The demo account cannot restore backups');
    }
    this.assertConsistent(file);
    const householdId = user.householdId;

    return this.prisma.$transaction(
      async (tx) => {
        // Categories: reuse same-name ones already here (new accounts start with the defaults).
        const existing = await tx.category.findMany({ where: { householdId } });
        const key = (c: { name: string; type: string }) => `${c.type}:${c.name.trim().toLowerCase()}`;
        const byKey = new Map(existing.map((c) => [key(c), c.id]));
        const categoryId = new Map<string, string>();
        const newCategories = [];
        for (const c of file.categories) {
          const found = byKey.get(key(c));
          if (found) {
            categoryId.set(c.ref, found);
            continue;
          }
          const id = randomUUID();
          byKey.set(key(c), id);
          categoryId.set(c.ref, id);
          newCategories.push({ id, householdId, ownerId: user.id, name: c.name, type: c.type, color: c.color ?? null, icon: c.icon ?? null });
        }
        await tx.category.createMany({ data: newCategories });

        const accountId = new Map(file.accounts.map((a) => [a.ref, randomUUID()]));
        await tx.account.createMany({
          data: file.accounts.map((a) => ({
            id: accountId.get(a.ref)!,
            householdId,
            ownerId: user.id,
            name: a.name,
            type: a.type,
            color: a.color ?? null,
            icon: a.icon ?? null,
            initialBalance: toDecimal(a.initialBalance),
            archived: a.archived,
          })),
        });

        // Rules first: generated transactions/transfers point at them, so the
        // scheduler won't create those dates again.
        const ruleId = new Map(file.recurring.map((r) => [r.ref, randomUUID()]));
        await tx.recurringRule.createMany({
          data: file.recurring.map((r) => ({
            id: ruleId.get(r.ref)!,
            householdId,
            createdById: user.id,
            description: r.description,
            amount: toDecimal(r.amount),
            type: r.type,
            frequency: r.frequency,
            categoryId: r.categoryRef ? categoryId.get(r.categoryRef)! : null,
            accountId: accountId.get(r.accountRef)!,
            toAccountId: r.toAccountRef ? accountId.get(r.toAccountRef)! : null,
            notes: r.notes ?? null,
            startDate: parseDateOnly(r.startDate),
            endDate: r.endDate ? parseDateOnly(r.endDate) : null,
            nextRunDate: parseDateOnly(r.nextRunDate),
            active: r.active,
          })),
        });

        const groupId = new Map<string, string>();
        const group = (ref: string) => groupId.get(ref) ?? (groupId.set(ref, randomUUID()), groupId.get(ref)!);
        for (let i = 0; i < file.transactions.length; i += 5000) {
          await tx.transaction.createMany({
            data: file.transactions.slice(i, i + 5000).map((t) => ({
              householdId,
              createdById: user.id,
              accountId: accountId.get(t.accountRef)!,
              categoryId: categoryId.get(t.categoryRef)!,
              type: t.type,
              description: t.description,
              amount: toDecimal(t.amount),
              date: parseDateOnly(t.date),
              notes: t.notes ?? null,
              installmentGroupId: t.installmentGroupRef ? group(t.installmentGroupRef) : null,
              installmentNumber: t.installmentGroupRef ? (t.installmentNumber ?? null) : null,
              installmentTotal: t.installmentGroupRef ? (t.installmentTotal ?? null) : null,
              recurringRuleId: t.recurringRef ? (ruleId.get(t.recurringRef) ?? null) : null,
              externalId: t.externalId ?? null,
            })),
          });
        }

        await tx.transfer.createMany({
          data: file.transfers.map((t) => ({
            householdId,
            createdById: user.id,
            fromAccountId: accountId.get(t.fromAccountRef)!,
            toAccountId: accountId.get(t.toAccountRef)!,
            amount: toDecimal(t.amount),
            date: parseDateOnly(t.date),
            description: t.description ?? null,
            recurringRuleId: t.recurringRef ? (ruleId.get(t.recurringRef) ?? null) : null,
          })),
        });

        // Budgets: if one already exists for that category and month, keep it.
        await tx.budget.createMany({
          data: file.budgets.map((b) => ({
            householdId,
            categoryId: categoryId.get(b.categoryRef)!,
            year: b.year,
            month: b.month,
            monthlyLimit: toDecimal(b.monthlyLimit),
          })),
          skipDuplicates: true,
        });

        for (const g of file.goals) {
          await tx.goal.create({
            data: {
              householdId,
              createdById: user.id,
              name: g.name,
              targetAmount: toDecimal(g.targetAmount),
              targetDate: g.targetDate ? parseDateOnly(g.targetDate) : null,
              color: g.color ?? null,
              icon: g.icon ?? null,
              archived: g.archived,
              contributions: {
                createMany: {
                  data: g.contributions.map((c) => ({ amount: toDecimal(c.amount), date: parseDateOnly(c.date), note: c.note ?? null, createdById: user.id })),
                },
              },
            },
          });
        }

        for (const inv of file.investments) {
          const investmentId = randomUUID();
          await tx.investment.create({
            data: {
              id: investmentId,
              householdId,
              accountId: accountId.get(inv.accountRef)!,
              assetClass: inv.assetClass,
              yieldMode: inv.yieldMode,
              rate: inv.rate === null || inv.rate === undefined ? null : toDecimal(inv.rate),
              startDate: parseDateOnly(inv.startDate),
              maturityDate: inv.maturityDate ? parseDateOnly(inv.maturityDate) : null,
            },
          });
          await tx.investmentValuation.createMany({
            data: inv.valuations.map((v) => ({ householdId, investmentId, date: parseDateOnly(v.date), value: toDecimal(v.value), createdById: user.id })),
            skipDuplicates: true,
          });
        }

        await tx.calendarEvent.createMany({
          data: file.events.map((e) => ({
            householdId,
            createdById: user.id,
            title: e.title,
            description: e.description ?? null,
            location: e.location ?? null,
            startAt: new Date(e.startAt),
            endAt: new Date(e.endAt),
            allDay: e.allDay,
            visibility: e.visibility,
            color: e.color ?? null,
            estimatedCost: e.estimatedCost === null || e.estimatedCost === undefined ? null : toDecimal(e.estimatedCost),
          })),
        });

        // The untouched default account of a brand-new user is not needed when the backup brings accounts.
        if (file.accounts.length > 0) {
          const fresh = await tx.account.findMany({ where: { householdId, id: { notIn: [...accountId.values()] }, initialBalance: 0 } });
          for (const a of fresh) {
            const used =
              (await tx.transaction.count({ where: { accountId: a.id } })) +
              (await tx.transfer.count({ where: { OR: [{ fromAccountId: a.id }, { toAccountId: a.id }] } })) +
              (await tx.recurringRule.count({ where: { OR: [{ accountId: a.id }, { toAccountId: a.id }] } }));
            if (!used) await tx.account.delete({ where: { id: a.id } });
          }
        }

        return {
          accounts: file.accounts.length,
          categories: newCategories.length,
          transactions: file.transactions.length,
          transfers: file.transfers.length,
          recurring: file.recurring.length,
          budgets: file.budgets.length,
          goals: file.goals.length,
          investments: file.investments.length,
          events: file.events.length,
        };
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
  }

  /** Every reference must point inside the file, with matching types. */
  private assertConsistent(file: BackupFileDto): void {
    const fail = (what: string): never => {
      throw new BadRequestException(`Invalid backup: ${what}`);
    };
    const unique = (refs: string[], what: string) => {
      if (new Set(refs).size !== refs.length) fail(`duplicate ${what} reference`);
    };
    unique(file.accounts.map((a) => a.ref), 'account');
    unique(file.categories.map((c) => c.ref), 'category');
    unique(file.recurring.map((r) => r.ref), 'recurring');

    const accounts = new Set(file.accounts.map((a) => a.ref));
    const categories = new Map(file.categories.map((c) => [c.ref, c.type]));
    const rules = new Set(file.recurring.map((r) => r.ref));
    const account = (ref: string) => accounts.has(ref) || fail('unknown account');

    for (const t of file.transactions) {
      account(t.accountRef);
      const type = categories.get(t.categoryRef) ?? fail('unknown category');
      if (type !== t.type) fail('transaction type differs from its category');
      if (t.recurringRef && !rules.has(t.recurringRef)) fail('unknown recurring rule');
      if (t.installmentGroupRef && (!t.installmentNumber || !t.installmentTotal || t.installmentNumber > t.installmentTotal)) {
        fail('incomplete installment');
      }
    }
    for (const t of file.transfers) {
      account(t.fromAccountRef);
      account(t.toAccountRef);
      if (t.fromAccountRef === t.toAccountRef) fail('transfer to the same account');
      if (t.recurringRef && !rules.has(t.recurringRef)) fail('unknown recurring rule');
    }
    for (const r of file.recurring) {
      account(r.accountRef);
      if (!!r.categoryRef === !!r.toAccountRef) fail('a rule needs either a category or a destination account');
      if (r.categoryRef && categories.get(r.categoryRef) !== r.type) fail('rule type differs from its category');
      if (r.toAccountRef) account(r.toAccountRef);
    }
    for (const b of file.budgets) {
      if (categories.get(b.categoryRef) !== 'EXPENSE') fail('budgets must use expense categories');
    }
    const invested = new Set<string>();
    for (const i of file.investments) {
      account(i.accountRef);
      if (invested.has(i.accountRef)) fail('two investments on one account');
      invested.add(i.accountRef);
    }
    for (const e of file.events) {
      if (new Date(e.endAt) < new Date(e.startAt)) fail('event ends before it starts');
    }
  }
}
