import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { formatDateOnly, parseDateOnly } from '../common/utils/date.js';
import { Decimal, formatMoney, toDecimal } from '../common/utils/money.js';
import type { Goal, GoalContribution } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  ContributionResponseDto,
  CreateContributionDto,
  CreateGoalDto,
  GoalDetailDto,
  GoalResponseDto,
  UpdateGoalDto,
} from './dto/goal.dto.js';
import { goalProgress } from './goal-progress.js';

type ContributionFull = GoalContribution & { createdBy: { id: string; name: string } | null };
type GoalFull = Goal & { contributions: ContributionFull[] };

const CONTRIBUTIONS = {
  include: { createdBy: { select: { id: true, name: true } } },
  orderBy: [{ date: 'desc' as const }, { createdAt: 'desc' as const }],
};

@Injectable()
export class GoalsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(householdId: string, includeArchived = false): Promise<GoalResponseDto[]> {
    const goals = await this.prisma.goal.findMany({
      where: { householdId, archived: includeArchived ? undefined : false },
      include: { contributions: CONTRIBUTIONS },
      orderBy: [{ archived: 'asc' }, { createdAt: 'asc' }],
    });
    return goals.map((g) => this.toResponse(g));
  }

  async findOne(householdId: string, id: string): Promise<GoalDetailDto> {
    const goal = await this.getOwned(householdId, id);
    return { ...this.toResponse(goal), contributions: goal.contributions.map((c) => this.toContribution(c)) };
  }

  async create(householdId: string, dto: CreateGoalDto, createdById: string): Promise<GoalDetailDto> {
    const goal = await this.prisma.goal.create({
      data: {
        householdId,
        createdById,
        name: dto.name,
        targetAmount: toDecimal(dto.targetAmount),
        targetDate: dto.targetDate ? parseDateOnly(dto.targetDate) : null,
        color: dto.color,
        icon: dto.icon,
      },
    });
    return this.findOne(householdId, goal.id);
  }

  async update(householdId: string, id: string, dto: UpdateGoalDto): Promise<GoalDetailDto> {
    await this.getOwned(householdId, id);
    await this.prisma.goal.update({
      where: { id, householdId },
      data: {
        name: dto.name,
        targetAmount: dto.targetAmount !== undefined ? toDecimal(dto.targetAmount) : undefined,
        targetDate: dto.targetDate !== undefined ? parseDateOnly(dto.targetDate) : undefined,
        color: dto.color,
        icon: dto.icon,
        archived: dto.archived,
      },
    });
    return this.findOne(householdId, id);
  }

  async remove(householdId: string, id: string): Promise<void> {
    await this.getOwned(householdId, id);
    await this.prisma.goal.delete({ where: { id, householdId } });
  }

  async addContribution(
    householdId: string,
    goalId: string,
    dto: CreateContributionDto,
    createdById: string,
  ): Promise<GoalDetailDto> {
    const goal = await this.getOwned(householdId, goalId);
    const saved = goal.contributions.reduce((acc, c) => acc.plus(c.amount), new Decimal(0));
    if (saved.plus(dto.amount).isNegative()) {
      throw new BadRequestException(`You can withdraw at most ${formatMoney(saved)} from this goal`);
    }
    await this.prisma.goalContribution.create({
      data: { goalId, createdById, amount: toDecimal(dto.amount), date: parseDateOnly(dto.date), note: dto.note },
    });
    return this.findOne(householdId, goalId);
  }

  async removeContribution(householdId: string, goalId: string, contributionId: string): Promise<GoalDetailDto> {
    const goal = await this.getOwned(householdId, goalId);
    const target = goal.contributions.find((c) => c.id === contributionId);
    if (!target) throw new NotFoundException('Contribution not found');
    const savedAfter = goal.contributions
      .filter((c) => c.id !== contributionId)
      .reduce((acc, c) => acc.plus(c.amount), new Decimal(0));
    if (savedAfter.isNegative()) {
      throw new BadRequestException('Removing this deposit would leave the goal negative; remove the withdrawal first');
    }
    await this.prisma.goalContribution.delete({ where: { id: contributionId } });
    return this.findOne(householdId, goalId);
  }

  private async getOwned(householdId: string, id: string): Promise<GoalFull> {
    const goal = await this.prisma.goal.findFirst({
      where: { id, householdId },
      include: { contributions: CONTRIBUTIONS },
    });
    if (!goal) throw new NotFoundException('Goal not found');
    return goal;
  }

  private toContribution(c: ContributionFull): ContributionResponseDto {
    return { id: c.id, amount: formatMoney(c.amount), date: formatDateOnly(c.date), note: c.note, createdBy: c.createdBy };
  }

  private toResponse(g: GoalFull): GoalResponseDto {
    const progress = goalProgress({
      target: toDecimal(g.targetAmount),
      targetDate: g.targetDate ? formatDateOnly(g.targetDate) : null,
      contributions: g.contributions.map((c) => ({ amount: toDecimal(c.amount), date: formatDateOnly(c.date) })),
      today: formatDateOnly(new Date()),
    });
    return {
      id: g.id,
      name: g.name,
      targetAmount: formatMoney(g.targetAmount),
      targetDate: g.targetDate ? formatDateOnly(g.targetDate) : null,
      color: g.color,
      icon: g.icon,
      archived: g.archived,
      ...progress,
      createdAt: g.createdAt,
    };
  }
}
