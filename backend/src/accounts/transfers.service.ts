import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { paginate, Paginated, toSkipTake } from '../common/dto/pagination.dto.js';
import { formatDateOnly, parseDateOnly } from '../common/utils/date.js';
import { formatMoney, toDecimal } from '../common/utils/money.js';
import type { Account, Prisma, Transfer } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CreateTransferDto,
  ListTransfersQueryDto,
  TransferResponseDto,
  UpdateTransferDto,
} from './dto/transfer.dto.js';

const INCLUDE = {
  fromAccount: true,
  toAccount: true,
  createdBy: { select: { id: true, name: true } },
} as const;

type TransferFull = Transfer & {
  fromAccount: Account;
  toAccount: Account;
  createdBy: { id: string; name: string } | null;
};

@Injectable()
export class TransfersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(householdId: string, dto: CreateTransferDto, createdById: string): Promise<TransferResponseDto> {
    if (dto.fromAccountId === dto.toAccountId) {
      throw new BadRequestException('Choose two different accounts');
    }
    const accounts = await this.prisma.account.findMany({
      where: { householdId, id: { in: [dto.fromAccountId, dto.toAccountId] } },
    });
    if (accounts.length !== 2) throw new NotFoundException('Account not found');
    if (accounts.some((a) => a.archived)) throw new BadRequestException('Account is archived');

    const transfer = await this.prisma.transfer.create({
      data: {
        householdId,
        createdById,
        fromAccountId: dto.fromAccountId,
        toAccountId: dto.toAccountId,
        amount: toDecimal(dto.amount),
        date: parseDateOnly(dto.date),
        description: dto.description,
      },
      include: INCLUDE,
    });
    return this.toResponse(transfer);
  }

  async findAll(householdId: string, query: ListTransfersQueryDto): Promise<Paginated<TransferResponseDto>> {
    if (query.startDate && query.endDate && query.startDate > query.endDate) {
      throw new BadRequestException('startDate must be before or equal to endDate');
    }
    const where: Prisma.TransferWhereInput = {
      householdId,
      OR: query.accountId ? [{ fromAccountId: query.accountId }, { toAccountId: query.accountId }] : undefined,
      date:
        query.startDate || query.endDate
          ? {
              gte: query.startDate ? parseDateOnly(query.startDate) : undefined,
              lte: query.endDate ? parseDateOnly(query.endDate) : undefined,
            }
          : undefined,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.transfer.findMany({
        where,
        include: INCLUDE,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        ...toSkipTake(query),
      }),
      this.prisma.transfer.count({ where }),
    ]);
    return paginate(items.map((t) => this.toResponse(t)), total, query);
  }

  async update(householdId: string, id: string, dto: UpdateTransferDto): Promise<TransferResponseDto> {
    await this.getOwned(householdId, id);
    const transfer = await this.prisma.transfer.update({
      where: { id, householdId },
      data: {
        amount: dto.amount !== undefined ? toDecimal(dto.amount) : undefined,
        date: dto.date !== undefined ? parseDateOnly(dto.date) : undefined,
        description: dto.description,
      },
      include: INCLUDE,
    });
    return this.toResponse(transfer);
  }

  async remove(householdId: string, id: string): Promise<void> {
    await this.getOwned(householdId, id);
    await this.prisma.transfer.delete({ where: { id, householdId } });
  }

  private async getOwned(householdId: string, id: string) {
    const transfer = await this.prisma.transfer.findFirst({ where: { id, householdId } });
    if (!transfer) throw new NotFoundException('Transfer not found');
    return transfer;
  }

  private toResponse(t: TransferFull): TransferResponseDto {
    const summary = (a: Account) => ({ id: a.id, name: a.name, type: a.type, color: a.color, icon: a.icon });
    return {
      id: t.id,
      amount: formatMoney(t.amount),
      date: formatDateOnly(t.date),
      description: t.description,
      fromAccount: summary(t.fromAccount),
      toAccount: summary(t.toAccount),
      createdBy: t.createdBy,
      createdAt: t.createdAt,
    };
  }
}
