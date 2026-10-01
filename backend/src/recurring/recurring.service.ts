import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AccountsService } from '../accounts/accounts.service.js';
import { formatDateOnly, parseDateOnly } from '../common/utils/date.js';
import { formatMoney, toDecimal } from '../common/utils/money.js';
import type { Account, Category, RecurringRule } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CreateRecurringDto,
  RecurringResponseDto,
  UpcomingOccurrenceDto,
  UpdateRecurringDto,
} from './dto/recurring.dto.js';
import { nextOccurrenceAfter, occurrencesBetween } from './recurrence.js';

type RuleFull = RecurringRule & { category: Category; account: Account; _count?: { transactions: number } };

/** Re-check each household at most this often on regular requests. */
const MATERIALIZE_INTERVAL_MS = 60_000;
const MAX_PER_RUN = 500;

const today = () => formatDateOnly(new Date());

@Injectable()
export class RecurringService {
  private readonly logger = new Logger(RecurringService.name);
  private readonly lastRun = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: AccountsService,
  ) {}

  async create(householdId: string, dto: CreateRecurringDto, createdById: string): Promise<RecurringResponseDto> {
    if (dto.endDate && dto.endDate < dto.startDate) {
      throw new BadRequestException('endDate must be on or after startDate');
    }
    await this.assertCategory(householdId, dto.categoryId, dto.type);
    const account = await this.accounts.resolveForEntry(householdId, dto.accountId);

    const rule = await this.prisma.recurringRule.create({
      data: {
        householdId,
        createdById,
        description: dto.description,
        amount: toDecimal(dto.amount),
        type: dto.type,
        frequency: dto.frequency,
        categoryId: dto.categoryId,
        accountId: account.id,
        notes: dto.notes,
        startDate: parseDateOnly(dto.startDate),
        endDate: dto.endDate ? parseDateOnly(dto.endDate) : null,
        nextRunDate: parseDateOnly(dto.startDate),
      },
    });
    // Occurrences already due (start date in the past or today) exist right away.
    await this.materializeRule(rule);
    return this.findOne(householdId, rule.id);
  }

  async findAll(householdId: string, includeInactive = true): Promise<RecurringResponseDto[]> {
    const rules = await this.prisma.recurringRule.findMany({
      where: { householdId, active: includeInactive ? undefined : true },
      include: { category: true, account: true, _count: { select: { transactions: true } } },
      orderBy: [{ active: 'desc' }, { nextRunDate: 'asc' }],
    });
    return rules.map((r) => this.toResponse(r));
  }

  async findOne(householdId: string, id: string): Promise<RecurringResponseDto> {
    return this.toResponse(await this.getOwned(householdId, id));
  }

  async update(householdId: string, id: string, dto: UpdateRecurringDto): Promise<RecurringResponseDto> {
    const rule = await this.getOwned(householdId, id);
    if (dto.categoryId && dto.categoryId !== rule.categoryId) {
      await this.assertCategory(householdId, dto.categoryId, rule.type);
    }
    if (dto.accountId && dto.accountId !== rule.accountId) {
      await this.accounts.resolveForEntry(householdId, dto.accountId);
    }
    const endDate = dto.endDate !== undefined ? parseDateOnly(dto.endDate) : undefined;
    if (endDate && endDate < rule.startDate) {
      throw new BadRequestException('endDate must be on or after startDate');
    }
    await this.prisma.recurringRule.update({
      where: { id, householdId },
      data: {
        description: dto.description,
        amount: dto.amount !== undefined ? toDecimal(dto.amount) : undefined,
        categoryId: dto.categoryId,
        accountId: dto.accountId,
        notes: dto.notes,
        endDate,
        active: dto.active,
      },
    });
    const updated = await this.getOwned(householdId, id);
    // Resuming a paused rule catches up with what became due meanwhile.
    if (updated.active) await this.materializeRule(updated);
    return this.findOne(householdId, id);
  }

  /** Stops the rule. Transactions it already generated stay as history. */
  async remove(householdId: string, id: string): Promise<void> {
    await this.getOwned(householdId, id);
    await this.prisma.recurringRule.delete({ where: { id, householdId } });
  }

  /** Occurrences not yet created in the next `days` days (calendar, insights). */
  async upcoming(householdId: string, days: number): Promise<UpcomingOccurrenceDto[]> {
    const from = today();
    const to = formatDateOnly(new Date(Date.now() + days * 86_400_000));
    const rules = await this.prisma.recurringRule.findMany({
      where: { householdId, active: true },
      include: { category: true },
    });
    return rules
      .flatMap((r) =>
        occurrencesBetween(
          { startDate: formatDateOnly(r.startDate), frequency: r.frequency, endDate: r.endDate && formatDateOnly(r.endDate) },
          // Strictly after today: today's occurrence is already a transaction.
          formatDateOnly(new Date(Date.parse(from) + 86_400_000)),
          to,
          60,
        ).map((date) => ({
          ruleId: r.id,
          description: r.description,
          amount: formatMoney(r.amount),
          type: r.type,
          date,
          category: {
            id: r.category.id,
            name: r.category.name,
            type: r.category.type,
            color: r.category.color,
            icon: r.category.icon,
          },
        })),
      )
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Turns every due occurrence of the household's active rules into a
   * transaction. Cheap to call often: throttled per household, and safe under
   * concurrency thanks to the unique (rule, date) constraint.
   */
  async materializeDue(householdId: string, force = false): Promise<void> {
    const last = this.lastRun.get(householdId) ?? 0;
    if (!force && Date.now() - last < MATERIALIZE_INTERVAL_MS) return;
    this.lastRun.set(householdId, Date.now());

    const due = await this.prisma.recurringRule.findMany({
      where: { householdId, active: true, nextRunDate: { lte: parseDateOnly(today()) } },
    });
    for (const rule of due) {
      try {
        await this.materializeRule(rule);
      } catch (error) {
        this.logger.error(`Failed to materialize rule ${rule.id}`, error instanceof Error ? error.stack : String(error));
      }
    }
  }

  private async materializeRule(rule: RecurringRule): Promise<void> {
    if (!rule.active) return;
    const schedule = {
      startDate: formatDateOnly(rule.startDate),
      frequency: rule.frequency,
      endDate: rule.endDate ? formatDateOnly(rule.endDate) : null,
    };
    const dates = occurrencesBetween(schedule, formatDateOnly(rule.nextRunDate), today(), MAX_PER_RUN);

    if (dates.length > 0) {
      await this.prisma.transaction.createMany({
        data: dates.map((date) => ({
          householdId: rule.householdId,
          createdById: rule.createdById,
          recurringRuleId: rule.id,
          description: rule.description,
          amount: rule.amount,
          type: rule.type,
          categoryId: rule.categoryId,
          accountId: rule.accountId,
          notes: rule.notes,
          date: parseDateOnly(date),
        })),
        skipDuplicates: true,
      });
    }

    const lastHandled = dates.at(-1) ?? null;
    const next = lastHandled
      ? nextOccurrenceAfter(schedule, lastHandled)
      : formatDateOnly(rule.nextRunDate);
    await this.prisma.recurringRule.update({
      where: { id: rule.id },
      data: next
        ? { nextRunDate: parseDateOnly(next) }
        : { active: false }, // past its end date: nothing left to generate
    });
  }

  private async assertCategory(householdId: string, categoryId: string, type: string): Promise<void> {
    const category = await this.prisma.category.findFirst({ where: { id: categoryId, householdId }, select: { type: true } });
    if (!category) throw new NotFoundException('Category not found');
    if (category.type !== type) {
      throw new BadRequestException(`Transaction type ${type} does not match category type ${category.type}`);
    }
  }

  private async getOwned(householdId: string, id: string): Promise<RuleFull> {
    const rule = await this.prisma.recurringRule.findFirst({
      where: { id, householdId },
      include: { category: true, account: true, _count: { select: { transactions: true } } },
    });
    if (!rule) throw new NotFoundException('Recurring rule not found');
    return rule;
  }

  private toResponse(r: RuleFull): RecurringResponseDto {
    return {
      id: r.id,
      description: r.description,
      amount: formatMoney(r.amount),
      type: r.type,
      frequency: r.frequency,
      category: { id: r.category.id, name: r.category.name, type: r.category.type, color: r.category.color, icon: r.category.icon },
      account: { id: r.account.id, name: r.account.name, type: r.account.type, color: r.account.color, icon: r.account.icon },
      startDate: formatDateOnly(r.startDate),
      endDate: r.endDate ? formatDateOnly(r.endDate) : null,
      nextDate: r.active ? formatDateOnly(r.nextRunDate) : null,
      active: r.active,
      notes: r.notes,
      generatedCount: r._count?.transactions ?? 0,
    };
  }
}
