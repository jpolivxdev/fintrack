import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  paginate,
  Paginated,
  toSkipTake,
} from '../common/dto/pagination.dto.js';
import type { Category, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CategoryResponseDto,
  CreateCategoryDto,
  ListCategoriesQueryDto,
  UpdateCategoryDto,
} from './dto/category.dto.js';

type CategoryWithCount = Category & {
  _count: { transactions: number; budgets: number };
};

const WITH_COUNT = {
  _count: { select: { transactions: true, budgets: true } },
} as const;

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(householdId: string, dto: CreateCategoryDto, ownerId: string): Promise<CategoryResponseDto> {
    await this.assertNameAvailable(householdId, dto.name, dto.type);
    const category = await this.prisma.category.create({
      data: { ...dto, householdId, ownerId },
      include: WITH_COUNT,
    });
    return this.toResponse(category);
  }

  async findAll(
    householdId: string,
    query: ListCategoriesQueryDto,
  ): Promise<Paginated<CategoryResponseDto>> {
    const where: Prisma.CategoryWhereInput = { householdId, type: query.type };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.category.findMany({
        where,
        include: WITH_COUNT,
        orderBy: [{ type: 'asc' }, { name: 'asc' }],
        ...toSkipTake(query),
      }),
      this.prisma.category.count({ where }),
    ]);
    return paginate(items.map((c) => this.toResponse(c)), total, query);
  }

  async findOne(householdId: string, id: string): Promise<CategoryResponseDto> {
    return this.toResponse(await this.getOwned(householdId, id));
  }

  async update(
    householdId: string,
    id: string,
    dto: UpdateCategoryDto,
  ): Promise<CategoryResponseDto> {
    const current = await this.getOwned(householdId, id);

    const typeChanged = dto.type !== undefined && dto.type !== current.type;
    if (
      typeChanged &&
      (current._count.transactions > 0 || current._count.budgets > 0)
    ) {
      throw new ConflictException(
        'Cannot change the type of a category that already has transactions or budgets',
      );
    }

    const name = dto.name ?? current.name;
    const type = dto.type ?? current.type;
    if (name !== current.name || type !== current.type) {
      await this.assertNameAvailable(householdId, name, type, id);
    }

    const updated = await this.prisma.category.update({
      where: { id, householdId },
      data: dto,
      include: WITH_COUNT,
    });
    return this.toResponse(updated);
  }

  async remove(householdId: string, id: string): Promise<void> {
    const category = await this.getOwned(householdId, id);
    const rules = await this.prisma.recurringRule.count({ where: { householdId, categoryId: id } });
    if (rules > 0) {
      throw new ConflictException('Category is used by recurring rules. Change or delete them first.');
    }
    if (category._count.transactions > 0) {
      throw new ConflictException(
        `Category has ${category._count.transactions} transaction(s). Move or delete them before deleting the category.`,
      );
    }
    await this.prisma.category.delete({ where: { id, householdId } });
  }

  /**
   * Loads a category scoped to the user. Another user's category yields the
   * same 404 as a missing one, so ids cannot be probed.
   */
  private async getOwned(householdId: string, id: string): Promise<CategoryWithCount> {
    const category = await this.prisma.category.findFirst({
      where: { id, householdId },
      include: WITH_COUNT,
    });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  private async assertNameAvailable(
    householdId: string,
    name: string,
    type: Category['type'],
    ignoreId?: string,
  ): Promise<void> {
    const clash = await this.prisma.category.findFirst({
      where: {
        householdId,
        type,
        name: { equals: name, mode: 'insensitive' },
        id: ignoreId ? { not: ignoreId } : undefined,
      },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictException(`A ${type.toLowerCase()} category named "${name}" already exists`);
    }
  }

  private toResponse(category: CategoryWithCount): CategoryResponseDto {
    return {
      id: category.id,
      name: category.name,
      type: category.type,
      color: category.color,
      icon: category.icon,
      transactionCount: category._count.transactions,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
    };
  }
}
