import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';
import { createPrismaMock, PrismaMock } from '../../test/utils/prisma-mock.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CategoriesService } from './categories.service.js';

const USER = 'user-1';

function dbCategory(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cat-1',
    name: 'Lazer',
    type: 'EXPENSE',
    color: '#8b5cf6',
    icon: 'gamepad-2',
    householdId: USER,
    createdAt: new Date(),
    updatedAt: new Date(),
    _count: { transactions: 0, budgets: 0 },
    ...overrides,
  };
}

describe('CategoriesService', () => {
  let prisma: PrismaMock;
  let service: CategoriesService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new CategoriesService(prisma as unknown as PrismaService);
  });

  it('creates a category for the user', async () => {
    prisma.category.findFirst.mockResolvedValue(null);
    prisma.category.create.mockResolvedValue(dbCategory());

    const result = await service.create(USER, { name: 'Lazer', type: 'EXPENSE' });

    expect(prisma.category.create.mock.calls[0][0].data).toEqual({
      name: 'Lazer',
      type: 'EXPENSE',
      householdId: USER,
    });
    expect(result.transactionCount).toBe(0);
  });

  it('rejects a duplicate name for the same type (case-insensitive)', async () => {
    prisma.category.findFirst.mockResolvedValue({ id: 'other' });

    await expect(
      service.create(USER, { name: 'lazer', type: 'EXPENSE' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.category.findFirst.mock.calls[0][0].where.name).toEqual({
      equals: 'lazer',
      mode: 'insensitive',
    });
  });

  it('filters the listing by type', async () => {
    prisma.category.findMany.mockResolvedValue([dbCategory()]);
    prisma.category.count.mockResolvedValue(1);

    const result = await service.findAll(USER, { page: 1, limit: 20, type: 'EXPENSE' });

    expect(prisma.category.findMany.mock.calls[0][0].where).toEqual({
      householdId: USER,
      type: 'EXPENSE',
    });
    expect(result.meta.total).toBe(1);
  });

  it("returns 404 for another user's category", async () => {
    prisma.category.findFirst.mockResolvedValue(null);

    await expect(service.findOne(USER, 'cat-x')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('blocks changing the type of a category that has transactions', async () => {
    prisma.category.findFirst.mockResolvedValueOnce(
      dbCategory({ _count: { transactions: 3, budgets: 0 } }),
    );

    await expect(service.update(USER, 'cat-1', { type: 'INCOME' })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.category.update).not.toHaveBeenCalled();
  });

  it('blocks deleting a category that has transactions', async () => {
    prisma.category.findFirst.mockResolvedValue(
      dbCategory({ _count: { transactions: 2, budgets: 0 } }),
    );

    await expect(service.remove(USER, 'cat-1')).rejects.toThrow(/2 transaction/);
    expect(prisma.category.delete).not.toHaveBeenCalled();
  });

  it('deletes an empty category', async () => {
    prisma.category.findFirst.mockResolvedValue(dbCategory());

    await service.remove(USER, 'cat-1');

    expect(prisma.category.delete).toHaveBeenCalledWith({ where: { id: 'cat-1', householdId: USER } });
  });
});
