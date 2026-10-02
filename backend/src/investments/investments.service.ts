import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountsService } from '../accounts/accounts.service.js';
import { formatDateOnly, parseDateOnly } from '../common/utils/date.js';
import { formatMoney, toDecimal } from '../common/utils/money.js';
import type { Account, Investment, InvestmentValuation, YieldMode } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  AllocationDto,
  CreateInvestmentDto,
  CreateValuationDto,
  HistoryPointDto,
  InvestmentDetailDto,
  InvestmentDto,
  InvestmentMovementDto,
  MarketInfoDto,
  PortfolioDto,
  UpdateInvestmentDto,
} from './dto/investment.dto.js';
import { MarketDataService, type MarketStatus } from './market-data.js';
import {
  addDays,
  monthEnds,
  percentOfCdi,
  profitPercent,
  simulate,
  type MarketData,
  type Movement,
  type SimulationResult,
} from './yield-engine.js';

type InvestmentFull = Investment & { account: Account; valuations: InvestmentValuation[] };

interface Simulated {
  investment: InvestmentFull;
  own: SimulationResult;
  /** Same external flows at 100% of the CDI. */
  cdi: SimulationResult;
  /** Same external flows corrected by the IPCA. */
  ipca: SimulationResult;
}

const today = () => formatDateOnly(new Date());
const money = (n: number) => formatMoney(toDecimal(n.toFixed(2)));
const round2 = (n: number) => Math.round(n * 100) / 100;
const summary = (a: Account) => ({ id: a.id, name: a.name, type: a.type, color: a.color, icon: a.icon });

/** Valid rate for a mode (MANUAL has none). */
function normalizeRate(mode: YieldMode, rate: number | null | undefined): number | null {
  if (mode === 'MANUAL') return null;
  if (rate === undefined || rate === null) throw new BadRequestException(`rate is required for ${mode}`);
  if (mode === 'CDI_PERCENT' && (rate < 1 || rate > 300)) {
    throw new BadRequestException('For CDI_PERCENT, rate is a % of the CDI between 1 and 300');
  }
  if (mode !== 'CDI_PERCENT' && (rate < -50 || rate > 100)) {
    throw new BadRequestException('For FIXED_RATE and IPCA_PLUS, rate is % per year between -50 and 100');
  }
  return rate;
}

@Injectable()
export class InvestmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: AccountsService,
    private readonly marketData: MarketDataService,
  ) {}

  async portfolio(householdId: string): Promise<PortfolioDto> {
    const now = today();
    const lastMonthEnd = addDays(`${now.slice(0, 7)}-01`, -1);
    const { sims, status, market } = await this.simulateAll(householdId, [lastMonthEnd]);

    const total = (pick: (s: Simulated) => number) => round2(sims.reduce((acc, s) => acc + pick(s), 0));
    const value = total((s) => s.own.value);
    const invested = total((s) => s.own.invested);
    const cdiValue = total((s) => s.cdi.value);
    const startValue = total((s) => s.own.points[0]?.value ?? 0);
    const startInvested = total((s) => s.own.points[0]?.invested ?? 0);

    const byClass = new Map<string, number>();
    for (const s of sims) if (s.own.value > 0) byClass.set(s.investment.assetClass, (byClass.get(s.investment.assetClass) ?? 0) + s.own.value);
    const allocation: AllocationDto[] = [...byClass.entries()]
      .map(([assetClass, v]) => ({ assetClass: assetClass as AllocationDto['assetClass'], value: money(v), percent: value > 0 ? round2((v / value) * 100) : 0 }))
      .sort((a, b) => b.percent - a.percent);

    return {
      summary: {
        value: money(value),
        invested: money(invested),
        profit: money(value - invested),
        profitPercent: profitPercent(value, invested),
        cdiValue: money(cdiValue),
        ipcaValue: money(total((s) => s.ipca.value)),
        percentOfCdi: percentOfCdi(value - invested, cdiValue - invested),
        monthProfit: money(value - startValue - (invested - startInvested)),
      },
      allocation,
      items: sims.map((s) => this.toItem(s)),
      market: this.marketInfo(status, market),
    };
  }

  /** Month-end evolution: value vs invested vs the same flows in CDI and IPCA. */
  async history(householdId: string, months: number, investmentId?: string): Promise<HistoryPointDto[]> {
    if (investmentId) await this.getOwned(householdId, investmentId);
    const checkpoints = monthEnds(today(), months);
    const { sims } = await this.simulateAll(householdId, checkpoints, investmentId);
    return checkpoints.map((date, i) => {
      const sum = (pick: (s: Simulated) => SimulationResult, field: 'value' | 'invested') =>
        money(sims.reduce((acc, s) => acc + (pick(s).points[i]?.[field] ?? 0), 0));
      return {
        date,
        value: sum((s) => s.own, 'value'),
        invested: sum((s) => s.own, 'invested'),
        cdiValue: sum((s) => s.cdi, 'value'),
        ipcaValue: sum((s) => s.ipca, 'value'),
      };
    });
  }

  async findOne(householdId: string, id: string): Promise<InvestmentDetailDto> {
    await this.getOwned(householdId, id);
    const { sims } = await this.simulateAll(householdId, [], id);
    const sim = sims[0];
    const accountId = sim.investment.accountId;

    const [transfers, transactions, rules] = await Promise.all([
      this.prisma.transfer.findMany({
        where: { householdId, OR: [{ fromAccountId: accountId }, { toAccountId: accountId }] },
        include: { fromAccount: true, toAccount: true },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        take: 100,
      }),
      this.prisma.transaction.findMany({
        where: { householdId, accountId },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        take: 100,
      }),
      this.prisma.recurringRule.findMany({
        where: { householdId, toAccountId: accountId },
        include: { account: true },
        orderBy: [{ active: 'desc' }, { nextRunDate: 'asc' }],
      }),
    ]);

    const movements: InvestmentMovementDto[] = [
      ...transfers.map((t) => {
        const incoming = t.toAccountId === accountId;
        return {
          id: t.id,
          kind: incoming ? ('CONTRIBUTION' as const) : ('WITHDRAWAL' as const),
          date: formatDateOnly(t.date),
          amount: formatMoney(t.amount),
          description: t.description,
          counterpart: summary(incoming ? t.fromAccount : t.toAccount),
        };
      }),
      ...transactions.map((t) => ({
        id: t.id,
        kind: t.type === 'INCOME' ? ('INCOME' as const) : ('FEE' as const),
        date: formatDateOnly(t.date),
        amount: formatMoney(t.amount),
        description: t.description,
        counterpart: null,
      })),
    ]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 100);

    return {
      ...this.toItem(sim),
      valuations: [...sim.investment.valuations]
        .reverse()
        .map((v) => ({ id: v.id, date: formatDateOnly(v.date), value: formatMoney(v.value) })),
      movements,
      scheduled: rules.map((r) => ({
        ruleId: r.id,
        description: r.description,
        amount: formatMoney(r.amount),
        frequency: r.frequency,
        nextDate: r.active ? formatDateOnly(r.nextRunDate) : null,
        active: r.active,
        fromAccount: summary(r.account),
      })),
    };
  }

  async create(householdId: string, dto: CreateInvestmentDto, userId: string): Promise<InvestmentDetailDto> {
    const rate = normalizeRate(dto.yieldMode, dto.rate);
    const startDate = dto.startDate ?? today();
    if (startDate > today()) throw new BadRequestException('startDate cannot be in the future');

    let id: string;
    if (dto.accountId) {
      // Start tracking an account that already exists (e.g. "Reserva de emergência").
      if (dto.initialAmount !== undefined || dto.fromAccountId) {
        throw new BadRequestException('initialAmount and fromAccountId only apply to new investments');
      }
      const account = await this.accounts.resolveForEntry(householdId, dto.accountId);
      if (account.type === 'CREDIT_CARD' || account.type === 'CASH') {
        throw new BadRequestException('Only savings or investment accounts can be tracked as investments');
      }
      const existing = await this.prisma.investment.findUnique({ where: { accountId: account.id } });
      if (existing) throw new ConflictException('This account is already tracked as an investment');
      const investment = await this.prisma.investment.create({
        data: {
          householdId,
          accountId: account.id,
          assetClass: dto.assetClass,
          yieldMode: dto.yieldMode,
          rate,
          startDate: parseDateOnly(dto.startDate ?? formatDateOnly(account.createdAt)),
          maturityDate: dto.maturityDate ? parseDateOnly(dto.maturityDate) : null,
        },
      });
      id = investment.id;
    } else {
      const from = dto.fromAccountId ? await this.accounts.resolveForEntry(householdId, dto.fromAccountId) : null;
      if (from && !dto.initialAmount) throw new BadRequestException('initialAmount is required with fromAccountId');
      id = await this.prisma.$transaction(async (tx) => {
        const account = await tx.account.create({
          data: {
            householdId,
            ownerId: userId,
            name: dto.name!,
            type: 'INVESTMENT',
            color: dto.color ?? '#22c55e',
            icon: 'trending-up',
            // Money moved from another account is a transfer, not an opening balance.
            initialBalance: from ? 0 : toDecimal(dto.initialAmount ?? 0),
          },
        });
        const investment = await tx.investment.create({
          data: {
            householdId,
            accountId: account.id,
            assetClass: dto.assetClass,
            yieldMode: dto.yieldMode,
            rate,
            startDate: parseDateOnly(startDate),
            maturityDate: dto.maturityDate ? parseDateOnly(dto.maturityDate) : null,
          },
        });
        if (from) {
          await tx.transfer.create({
            data: {
              householdId,
              createdById: userId,
              fromAccountId: from.id,
              toAccountId: account.id,
              amount: toDecimal(dto.initialAmount!),
              date: parseDateOnly(startDate),
              description: 'Aporte inicial',
            },
          });
        }
        return investment.id;
      });
    }
    return this.findOne(householdId, id);
  }

  async update(householdId: string, id: string, dto: UpdateInvestmentDto): Promise<InvestmentDetailDto> {
    const current = await this.getOwned(householdId, id);
    const mode = dto.yieldMode ?? current.yieldMode;
    const rate =
      dto.yieldMode !== undefined || dto.rate !== undefined
        ? normalizeRate(mode, dto.rate !== undefined ? dto.rate : current.rate?.toNumber())
        : undefined;

    if (dto.name !== undefined || dto.color !== undefined || dto.archived !== undefined) {
      await this.accounts.update(householdId, current.accountId, { name: dto.name, color: dto.color, archived: dto.archived });
    }
    await this.prisma.investment.update({
      where: { id, householdId },
      data: {
        assetClass: dto.assetClass,
        yieldMode: dto.yieldMode,
        rate,
        maturityDate: dto.maturityDate === undefined ? undefined : dto.maturityDate ? parseDateOnly(dto.maturityDate) : null,
      },
    });
    return this.findOne(householdId, id);
  }

  /** Deletes an investment without history (account included); otherwise archive it. */
  async remove(householdId: string, id: string): Promise<void> {
    const investment = await this.getOwned(householdId, id);
    const rules = await this.prisma.recurringRule.count({ where: { householdId, toAccountId: investment.accountId } });
    if (rules > 0) throw new ConflictException('Remove the scheduled contributions first, or archive the investment');
    // AccountsService refuses accounts with transactions/transfers (409: archive instead).
    await this.accounts.remove(householdId, investment.accountId);
  }

  async addValuation(householdId: string, id: string, dto: CreateValuationDto, userId: string): Promise<InvestmentDetailDto> {
    const investment = await this.getOwned(householdId, id);
    if (dto.date > today()) throw new BadRequestException('A valuation cannot be in the future');
    if (dto.date < formatDateOnly(investment.startDate)) {
      throw new BadRequestException('A valuation cannot be before the investment start date');
    }
    const date = parseDateOnly(dto.date);
    await this.prisma.investmentValuation.upsert({
      where: { investmentId_date: { investmentId: id, date } },
      create: { householdId, investmentId: id, date, value: toDecimal(dto.value), createdById: userId },
      update: { value: toDecimal(dto.value), createdById: userId },
    });
    return this.findOne(householdId, id);
  }

  async removeValuation(householdId: string, id: string, valuationId: string): Promise<InvestmentDetailDto> {
    await this.getOwned(householdId, id);
    const { count } = await this.prisma.investmentValuation.deleteMany({ where: { id: valuationId, investmentId: id, householdId } });
    if (count === 0) throw new NotFoundException('Valuation not found');
    return this.findOne(householdId, id);
  }

  // ---------------- internals ----------------

  private async simulateAll(
    householdId: string,
    checkpoints: string[],
    onlyId?: string,
  ): Promise<{ sims: Simulated[]; status: MarketStatus; market: MarketData }> {
    const now = today();
    const investments = await this.prisma.investment.findMany({
      where: { householdId, id: onlyId },
      include: { account: true, valuations: { orderBy: { date: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });
    const accountIds = investments.map((i) => i.accountId);
    const until = parseDateOnly(now);
    const [transfers, transactions] = accountIds.length
      ? await Promise.all([
          this.prisma.transfer.findMany({
            where: { householdId, date: { lte: until }, OR: [{ fromAccountId: { in: accountIds } }, { toAccountId: { in: accountIds } }] },
            select: { fromAccountId: true, toAccountId: true, amount: true, date: true },
          }),
          this.prisma.transaction.findMany({
            where: { householdId, date: { lte: until }, accountId: { in: accountIds } },
            select: { accountId: true, type: true, amount: true, date: true },
          }),
        ])
      : [[], []];

    const movementsOf = (inv: InvestmentFull): Movement[] => {
      const list: Movement[] = [];
      const initial = inv.account.initialBalance.toNumber();
      if (initial !== 0) list.push({ date: formatDateOnly(inv.startDate), amount: initial, external: true });
      for (const t of transfers) {
        if (t.toAccountId === inv.accountId) list.push({ date: formatDateOnly(t.date), amount: t.amount.toNumber(), external: true });
        if (t.fromAccountId === inv.accountId) list.push({ date: formatDateOnly(t.date), amount: -t.amount.toNumber(), external: true });
      }
      for (const t of transactions) {
        if (t.accountId !== inv.accountId) continue;
        // Income (interest, dividends) and fees are part of the return.
        list.push({ date: formatDateOnly(t.date), amount: t.type === 'INCOME' ? t.amount.toNumber() : -t.amount.toNumber(), external: false });
      }
      return list;
    };

    const movements = new Map(investments.map((inv) => [inv.id, movementsOf(inv)]));
    const earliest = [...movements.values()].flat().map((m) => m.date).concat(investments.map((i) => formatDateOnly(i.startDate))).sort()[0] ?? now;
    // At least ~13 months, so "IPCA in 12 months" works even for new investments.
    const { market, status } = await this.marketData.load([earliest, addDays(now, -400)].sort()[0], now);

    const sims = investments.map((investment) => {
      const all = movements.get(investment.id)!;
      const external = all.filter((m) => m.external);
      const base = { market, until: now, checkpoints };
      return {
        investment,
        own: simulate({
          ...base,
          mode: investment.yieldMode,
          rate: investment.rate?.toNumber() ?? null,
          movements: all,
          valuations: investment.valuations.map((v) => ({ date: formatDateOnly(v.date), value: v.value.toNumber() })),
        }),
        cdi: simulate({ ...base, mode: 'CDI_PERCENT', rate: 100, movements: external }),
        ipca: simulate({ ...base, mode: 'IPCA_PLUS', rate: 0, movements: external }),
      };
    });
    return { sims, status, market };
  }

  private toItem(s: Simulated): InvestmentDto {
    const { investment: inv, own, cdi } = s;
    const last = inv.valuations.at(-1);
    return {
      id: inv.id,
      account: summary(inv.account),
      assetClass: inv.assetClass,
      yieldMode: inv.yieldMode,
      rate: inv.rate ? inv.rate.toFixed(4) : null,
      startDate: formatDateOnly(inv.startDate),
      maturityDate: inv.maturityDate ? formatDateOnly(inv.maturityDate) : null,
      archived: inv.account.archived,
      value: money(own.value),
      invested: money(own.invested),
      profit: money(own.value - own.invested),
      profitPercent: profitPercent(own.value, own.invested),
      percentOfCdi: inv.yieldMode === 'MANUAL' && !last ? null : percentOfCdi(own.value - own.invested, cdi.value - cdi.invested),
      lastValuation: last ? { id: last.id, date: formatDateOnly(last.date), value: formatMoney(last.value) } : null,
      missingMarketData: own.missingMarketData,
    };
  }

  private marketInfo(status: MarketStatus, market: MarketData): MarketInfoDto {
    const lastCdi = status.cdiUpdatedAt ? market.cdi.get(status.cdiUpdatedAt) : undefined;
    const months = [...market.ipca.keys()].sort().slice(-12);
    return {
      cdiUpdatedAt: status.cdiUpdatedAt,
      cdiAnnual: lastCdi === undefined ? null : round2((Math.pow(1 + lastCdi / 100, 252) - 1) * 100),
      ipcaUpdatedAt: status.ipcaUpdatedAt,
      ipca12m: months.length === 12 ? round2((months.reduce((acc, m) => acc * (1 + market.ipca.get(m)! / 100), 1) - 1) * 100) : null,
    };
  }

  private async getOwned(householdId: string, id: string): Promise<InvestmentFull> {
    const investment = await this.prisma.investment.findFirst({
      where: { id, householdId },
      include: { account: true, valuations: { orderBy: { date: 'asc' } } },
    });
    if (!investment) throw new NotFoundException('Investment not found');
    return investment;
  }
}
