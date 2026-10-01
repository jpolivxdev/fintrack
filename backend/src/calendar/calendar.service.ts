import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { formatDateOnly } from '../common/utils/date.js';
import { formatMoney, toDecimal } from '../common/utils/money.js';
import type { CalendarEvent, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { occurrencesBetween } from '../recurring/recurrence.js';
import {
  CalendarBillDto,
  CalendarFeedDto,
  CreateEventDto,
  EventResponseDto,
  UpdateEventDto,
} from './dto/event.dto.js';

type EventFull = CalendarEvent & { createdBy: { id: string; name: string } | null };

const MAX_WINDOW_MS = 400 * 86_400_000;

/**
 * Last calendar day (in the client's own offset) covered by an exclusive end:
 * "2026-11-01T00:00:00-03:00" covers up to 2026-10-31.
 */
export function lastLocalDay(to: string): string {
  const date = to.slice(0, 10);
  if (!/T00:00(:00(.0+)?)?(Z|[+-])/.test(to)) return date;
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** What a member may see: every shared event, plus their own private ones. */
function visibleTo(user: AuthUser): Prisma.CalendarEventWhereInput {
  return {
    householdId: user.householdId,
    OR: [{ visibility: 'SHARED' }, { createdById: user.id }],
  };
}

@Injectable()
export class CalendarService {
  constructor(private readonly prisma: PrismaService) {}

  async feed(user: AuthUser, from: string, to: string): Promise<CalendarFeedDto> {
    const start = new Date(from);
    const end = new Date(to);
    if (end <= start) throw new BadRequestException('"to" must be after "from"');
    if (end.getTime() - start.getTime() > MAX_WINDOW_MS) {
      throw new BadRequestException('The window can span at most 400 days');
    }

    const [events, bills] = await Promise.all([
      this.prisma.calendarEvent.findMany({
        // Overlap test: starts before the window ends and ends after it starts.
        where: { ...visibleTo(user), startAt: { lt: end }, endAt: { gte: start } },
        include: { createdBy: { select: { id: true, name: true } } },
        orderBy: { startAt: 'asc' },
      }),
      // The client's local dates for the window (it sent them with its offset).
      this.bills(user.householdId, from.slice(0, 10), lastLocalDay(to)),
    ]);
    return { events: events.map((e) => this.toResponse(e, user)), bills };
  }

  async findOne(user: AuthUser, id: string): Promise<EventResponseDto> {
    return this.toResponse(await this.getVisible(user, id), user);
  }

  async create(user: AuthUser, dto: CreateEventDto): Promise<EventResponseDto> {
    this.assertRange(dto.startAt, dto.endAt);
    const event = await this.prisma.calendarEvent.create({
      data: {
        householdId: user.householdId,
        createdById: user.id,
        title: dto.title,
        description: dto.description,
        location: dto.location,
        startAt: new Date(dto.startAt),
        endAt: new Date(dto.endAt),
        allDay: dto.allDay ?? false,
        visibility: dto.visibility ?? 'SHARED',
        color: dto.color,
        estimatedCost: dto.estimatedCost !== undefined ? toDecimal(dto.estimatedCost) : null,
      },
      include: { createdBy: { select: { id: true, name: true } } },
    });
    return this.toResponse(event, user);
  }

  /**
   * Shared events can be edited by any member (it's a couple's calendar);
   * private ones only by their creator, and others can't even see them.
   */
  async update(user: AuthUser, id: string, dto: UpdateEventDto): Promise<EventResponseDto> {
    const current = await this.getVisible(user, id);
    // Making someone else's shared event private would hide it from its owner.
    if (dto.visibility === 'PRIVATE' && current.createdById !== user.id) {
      throw new BadRequestException('Only the creator can make an event private');
    }
    this.assertRange(dto.startAt ?? current.startAt.toISOString(), dto.endAt ?? current.endAt.toISOString());
    const event = await this.prisma.calendarEvent.update({
      where: { id, householdId: user.householdId },
      data: {
        title: dto.title,
        description: dto.description,
        location: dto.location,
        startAt: dto.startAt ? new Date(dto.startAt) : undefined,
        endAt: dto.endAt ? new Date(dto.endAt) : undefined,
        allDay: dto.allDay,
        visibility: dto.visibility,
        color: dto.color,
        estimatedCost: dto.estimatedCost !== undefined ? toDecimal(dto.estimatedCost) : undefined,
      },
      include: { createdBy: { select: { id: true, name: true } } },
    });
    return this.toResponse(event, user);
  }

  async remove(user: AuthUser, id: string): Promise<void> {
    await this.getVisible(user, id);
    await this.prisma.calendarEvent.delete({ where: { id, householdId: user.householdId } });
  }

  /** Recurring occurrences in [from, to] (dates), marked done when already created. */
  private async bills(householdId: string, from: string, to: string): Promise<CalendarBillDto[]> {
    const rules = await this.prisma.recurringRule.findMany({
      where: { householdId },
      include: {
        category: true,
        transactions: {
          where: { date: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) } },
          select: { date: true },
        },
      },
    });
    return rules
      .flatMap((rule) => {
        const done = new Set(rule.transactions.map((t) => formatDateOnly(t.date)));
        const dates = occurrencesBetween(
          {
            startDate: formatDateOnly(rule.startDate),
            frequency: rule.frequency,
            endDate: rule.endDate ? formatDateOnly(rule.endDate) : null,
          },
          from,
          to,
          120,
        )
          // A paused rule only shows what already happened.
          .filter((date) => rule.active || done.has(date));
        return dates.map((date) => ({
          ruleId: rule.id,
          description: rule.description,
          amount: formatMoney(rule.amount),
          type: rule.type,
          date,
          category: {
            id: rule.category.id,
            name: rule.category.name,
            type: rule.category.type,
            color: rule.category.color,
            icon: rule.category.icon,
          },
          done: done.has(date),
        }));
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  private assertRange(startAt: string, endAt: string): void {
    if (new Date(endAt) < new Date(startAt)) {
      throw new BadRequestException('endAt must be on or after startAt');
    }
  }

  private async getVisible(user: AuthUser, id: string): Promise<EventFull> {
    const event = await this.prisma.calendarEvent.findFirst({
      where: { id, ...visibleTo(user) },
      include: { createdBy: { select: { id: true, name: true } } },
    });
    // Someone else's private event looks exactly like a missing one.
    if (!event) throw new NotFoundException('Event not found');
    return event;
  }

  private toResponse(e: EventFull, user: AuthUser): EventResponseDto {
    return {
      id: e.id,
      title: e.title,
      description: e.description,
      location: e.location,
      startAt: e.startAt.toISOString(),
      endAt: e.endAt.toISOString(),
      allDay: e.allDay,
      visibility: e.visibility,
      color: e.color,
      estimatedCost: e.estimatedCost ? formatMoney(e.estimatedCost) : null,
      createdBy: e.createdBy,
      isMine: e.createdById === user.id,
    };
  }
}
