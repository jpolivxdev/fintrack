import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountsService } from '../accounts/accounts.service.js';
import { createPrismaMock, PrismaMock } from '../../test/utils/prisma-mock.js';
import { Decimal } from '../common/utils/money.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ListTransactionsQueryDto } from './dto/transaction.dto.js';
import { TransactionsService } from './transactions.service.js';

const USER = 'user-1';
const category = {
  id: 'cat-food',
  name: 'Alimentação',
  type: 'EXPENSE' as const,
  color: '#ef4444',
  icon: 'utensils',
};

function dbTransaction(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tx-1',
    description: 'Mercado',
    amount: new Decimal('249.90'),
    type: 'EXPENSE',
    date: new Date('2026-10-01T00:00:00Z'),
    notes: null,
    categoryId: category.id,
    householdId: USER,
    createdAt: new Date('2026-10-01T10:00:00Z'),
    updatedAt: new Date('2026-10-01T10:00:00Z'),
    category,
    accountId: 'acc-1',
    account: { id: 'acc-1', name: 'Conta principal', type: 'CHECKING', color: null, icon: null },
    installmentGroupId: null,
    installmentNumber: null,
    installmentTotal: null,
    createdBy: null,
    ...overrides,
  };
}

function listQuery(overrides: Partial<ListTransactionsQueryDto> = {}) {
  return Object.assign(new ListTransactionsQueryDto(), overrides);
}

describe('TransactionsService', () => {
  let prisma: PrismaMock;
  let service: TransactionsService;
  let accounts: { resolveForEntry: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    prisma = createPrismaMock();
    accounts = { resolveForEntry: vi.fn().mockResolvedValue({ id: 'acc-1' }) };
    service = new TransactionsService(
      prisma as unknown as PrismaService,
      accounts as unknown as AccountsService,
    );
  });

  describe('create', () => {
    const dto = {
      description: 'Mercado',
      amount: 249.9,
      type: 'EXPENSE' as const,
      date: '2026-10-01',
      categoryId: category.id,
    };

    it('stores the amount as an exact Decimal and the date at UTC midnight', async () => {
      prisma.category.findFirst.mockResolvedValue({ type: 'EXPENSE' });
      prisma.transaction.create.mockResolvedValue(dbTransaction());

      const result = await service.create(USER, dto);

      const { data } = prisma.transaction.create.mock.calls[0][0];
      expect(data.amount).toBeInstanceOf(Decimal);
      expect(data.amount.toFixed(2)).toBe('249.90');
      expect(data.date.toISOString()).toBe('2026-10-01T00:00:00.000Z');
      expect(data.householdId).toBe(USER);

      expect(result).toMatchObject({ amount: '249.90', date: '2026-10-01' });
      expect(result.category).toEqual(category);
    });

    it("looks the category up scoped to the user and 404s for someone else's", async () => {
      prisma.category.findFirst.mockResolvedValue(null);

      await expect(service.create(USER, dto)).rejects.toThrow(
        new NotFoundException('Category not found'),
      );
      expect(prisma.category.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: category.id, householdId: USER } }),
      );
      expect(prisma.transaction.create).not.toHaveBeenCalled();
    });

    it('rejects a type that does not match the category type', async () => {
      prisma.category.findFirst.mockResolvedValue({ type: 'INCOME' });

      await expect(service.create(USER, dto)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.transaction.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    beforeEach(() => {
      prisma.transaction.findMany.mockResolvedValue([dbTransaction()]);
      prisma.transaction.count.mockResolvedValue(41);
      prisma.transaction.groupBy.mockResolvedValue([
        { type: 'INCOME', _sum: { amount: new Decimal('5000.00') } },
        { type: 'EXPENSE', _sum: { amount: new Decimal('1234.56') } },
      ]);
    });

    it('applies filters, pagination and sorting, and returns totals', async () => {
      const result = await service.findAll(
        USER,
        listQuery({
          page: 3,
          limit: 10,
          type: 'EXPENSE',
          categoryId: category.id,
          startDate: '2026-10-01',
          endDate: '2026-10-31',
          search: 'merc',
          sortBy: 'amount',
          order: 'asc',
        }),
      );

      const args = prisma.transaction.findMany.mock.calls[0][0];
      expect(args.where).toEqual({
        householdId: USER,
        type: 'EXPENSE',
        categoryId: category.id,
        date: {
          gte: new Date('2026-10-01T00:00:00Z'),
          lte: new Date('2026-10-31T00:00:00Z'),
        },
        description: { contains: 'merc', mode: 'insensitive' },
      });
      expect(args.skip).toBe(20);
      expect(args.take).toBe(10);
      expect(args.orderBy[0]).toEqual({ amount: 'asc' });

      expect(result.meta).toEqual({ total: 41, page: 3, limit: 10, totalPages: 5 });
      expect(result.totals).toEqual({ income: '5000.00', expense: '1234.56', net: '3765.44' });
    });

    it('always scopes the query to the user even without filters', async () => {
      await service.findAll(USER, listQuery());

      const { where } = prisma.transaction.findMany.mock.calls[0][0];
      expect(where.householdId).toBe(USER);
      expect(where.date).toBeUndefined();
    });

    it('rejects an inverted date range', async () => {
      await expect(
        service.findAll(USER, listQuery({ startDate: '2026-10-31', endDate: '2026-10-01' })),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('update', () => {
    it('re-validates the category when the type changes', async () => {
      prisma.transaction.findFirst.mockResolvedValue(dbTransaction());
      prisma.category.findFirst.mockResolvedValue({ type: 'EXPENSE' });

      await expect(service.update(USER, 'tx-1', { type: 'INCOME' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.transaction.update).not.toHaveBeenCalled();
    });

    it('skips category validation when neither category nor type changes', async () => {
      prisma.transaction.findFirst.mockResolvedValue(dbTransaction());
      prisma.transaction.update.mockResolvedValue(dbTransaction({ amount: new Decimal('10.00') }));

      const result = await service.update(USER, 'tx-1', { amount: 10 });

      expect(prisma.category.findFirst).not.toHaveBeenCalled();
      expect(result.amount).toBe('10.00');
    });

    it("404s on another user's transaction", async () => {
      prisma.transaction.findFirst.mockResolvedValue(null);

      await expect(service.update(USER, 'tx-x', { amount: 1 })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.transaction.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'tx-x', householdId: USER } }),
      );
    });
  });

  describe('remove', () => {
    it('deletes an owned transaction', async () => {
      prisma.transaction.findFirst.mockResolvedValue(dbTransaction());

      await service.remove(USER, 'tx-1');

      expect(prisma.transaction.delete).toHaveBeenCalledWith({ where: { id: 'tx-1', householdId: USER } });
    });

    it('does not delete when the transaction is not owned', async () => {
      prisma.transaction.findFirst.mockResolvedValue(null);

      await expect(service.remove(USER, 'tx-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.transaction.delete).not.toHaveBeenCalled();
    });
  });
});
