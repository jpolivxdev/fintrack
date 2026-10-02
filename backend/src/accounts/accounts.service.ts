import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { formatDateOnly } from '../common/utils/date.js';
import { Decimal, formatMoney, toDecimal } from '../common/utils/money.js';
import type { Account, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  AccountListDto,
  AccountResponseDto,
  CreateAccountDto,
  UpdateAccountDto,
} from './dto/account.dto.js';

export interface AccountBalance {
  balance: Decimal;
  upcoming: Decimal;
}

const ZERO = () => new Decimal(0);

/** Today as a Postgres DATE (UTC), the cut between "balance" and "upcoming". */
function todayDate(): Date {
  return new Date(`${formatDateOnly(new Date())}T00:00:00.000Z`);
}

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(householdId: string, includeArchived = false): Promise<AccountListDto> {
    const accounts = await this.prisma.account.findMany({
      where: { householdId, archived: includeArchived ? undefined : false },
      include: { _count: { select: { transactions: true } } },
      orderBy: [{ archived: 'asc' }, { createdAt: 'asc' }],
    });
    const balances = await this.balances(householdId);
    const data = accounts.map((a) => this.toResponse(a, balances.get(a.id)));
    const totalBalance = accounts
      .filter((a) => !a.archived)
      .reduce((acc, a) => acc.plus(balances.get(a.id)?.balance ?? toDecimal(a.initialBalance)), ZERO());
    return { data, totalBalance: formatMoney(totalBalance) };
  }

  async findOne(householdId: string, id: string): Promise<AccountResponseDto> {
    const account = await this.getOwned(householdId, id);
    const balances = await this.balances(householdId);
    return this.toResponse(account, balances.get(id));
  }

  async create(householdId: string, dto: CreateAccountDto, ownerId: string): Promise<AccountResponseDto> {
    const account = await this.prisma.account.create({
      data: { ...dto, initialBalance: toDecimal(dto.initialBalance ?? 0), householdId, ownerId },
      include: { _count: { select: { transactions: true } } },
    });
    return this.toResponse(account, undefined);
  }

  async update(householdId: string, id: string, dto: UpdateAccountDto): Promise<AccountResponseDto> {
    const current = await this.getOwned(householdId, id);
    if (dto.archived === true && !current.archived) {
      await this.assertAnotherActiveAccount(householdId, id);
    }
    await this.prisma.account.update({
      where: { id, householdId },
      data: {
        ...dto,
        initialBalance: dto.initialBalance !== undefined ? toDecimal(dto.initialBalance) : undefined,
      },
    });
    return this.findOne(householdId, id);
  }

  async remove(householdId: string, id: string): Promise<void> {
    const account = await this.getOwned(householdId, id);
    const transfers = await this.prisma.transfer.count({
      where: { householdId, OR: [{ fromAccountId: id }, { toAccountId: id }] },
    });
    if (account._count.transactions > 0 || transfers > 0) {
      throw new ConflictException('Account has history. Archive it instead of deleting.');
    }
    if (!account.archived) await this.assertAnotherActiveAccount(householdId, id);
    await this.prisma.account.delete({ where: { id, householdId } });
  }

  /**
   * The account a new transaction goes to: the given one (must be this
   * household's and active) or, when omitted, the oldest active account.
   */
  async resolveForEntry(householdId: string, accountId?: string): Promise<Account> {
    if (accountId) {
      const account = await this.prisma.account.findFirst({ where: { id: accountId, householdId } });
      if (!account) throw new NotFoundException('Account not found');
      if (account.archived) throw new BadRequestException('Account is archived');
      return account;
    }
    const fallback = await this.prisma.account.findFirst({
      where: { householdId, archived: false },
      orderBy: { createdAt: 'asc' },
    });
    if (!fallback) throw new BadRequestException('Create an account first');
    return fallback;
  }

  /**
   * Balance per account in a few aggregate queries:
   * initial + income − expense − transfers out + transfers in, split into
   * what is dated up to today (balance) and what is dated later (upcoming).
   */
  async balances(householdId: string): Promise<Map<string, AccountBalance>> {
    const today = todayDate();
    const [accounts, txPast, txFuture, outPast, outFuture, inPast, inFuture] = await Promise.all([
      this.prisma.account.findMany({ where: { householdId }, select: { id: true, initialBalance: true } }),
      this.txByAccount(householdId, { lte: today }),
      this.txByAccount(householdId, { gt: today }),
      this.transfersBy('fromAccountId', householdId, { lte: today }),
      this.transfersBy('fromAccountId', householdId, { gt: today }),
      this.transfersBy('toAccountId', householdId, { lte: today }),
      this.transfersBy('toAccountId', householdId, { gt: today }),
    ]);

    const result = new Map<string, AccountBalance>();
    for (const a of accounts) {
      const net = (tx: typeof txPast, out: Map<string, Decimal>, inn: Map<string, Decimal>) => {
        const income = toDecimal(tx.find((g) => g.accountId === a.id && g.type === 'INCOME')?._sum.amount);
        const expense = toDecimal(tx.find((g) => g.accountId === a.id && g.type === 'EXPENSE')?._sum.amount);
        return income.minus(expense).minus(out.get(a.id) ?? ZERO()).plus(inn.get(a.id) ?? ZERO());
      };
      result.set(a.id, {
        balance: toDecimal(a.initialBalance).plus(net(txPast, outPast, inPast)),
        upcoming: net(txFuture, outFuture, inFuture),
      });
    }
    return result;
  }

  private txByAccount(householdId: string, date: Prisma.DateTimeFilter) {
    return this.prisma.transaction.groupBy({
      by: ['accountId', 'type'],
      where: { householdId, date },
      _sum: { amount: true },
    });
  }

  private async transfersBy(
    side: 'fromAccountId' | 'toAccountId',
    householdId: string,
    date: Prisma.DateTimeFilter,
  ): Promise<Map<string, Decimal>> {
    const groups = await this.prisma.transfer.groupBy({
      by: [side],
      where: { householdId, date },
      _sum: { amount: true },
    });
    return new Map(
      groups.map((g) => [(g as Record<string, unknown>)[side] as string, toDecimal(g._sum.amount)]),
    );
  }

  private async assertAnotherActiveAccount(householdId: string, exceptId: string): Promise<void> {
    const others = await this.prisma.account.count({
      where: { householdId, archived: false, id: { not: exceptId } },
    });
    if (others === 0) {
      throw new ConflictException('Keep at least one active account: new entries need somewhere to go');
    }
  }

  private async getOwned(householdId: string, id: string) {
    const account = await this.prisma.account.findFirst({
      where: { id, householdId },
      include: { _count: { select: { transactions: true } } },
    });
    if (!account) throw new NotFoundException('Account not found');
    return account;
  }

  private toResponse(
    a: Account & { _count: { transactions: number } },
    balance: AccountBalance | undefined,
  ): AccountResponseDto {
    return {
      id: a.id,
      name: a.name,
      type: a.type,
      color: a.color,
      icon: a.icon,
      initialBalance: formatMoney(a.initialBalance),
      balance: formatMoney(balance?.balance ?? a.initialBalance),
      upcoming: formatMoney(balance?.upcoming ?? 0),
      archived: a.archived,
      transactionCount: a._count.transactions,
      createdAt: a.createdAt,
    };
  }
}
