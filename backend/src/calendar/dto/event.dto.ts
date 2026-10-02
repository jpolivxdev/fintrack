import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsNumber, IsOptional, Matches, Max, Min } from 'class-validator';
import { AccountSummaryDto } from '../../accounts/dto/account.dto.js';
import { CategorySummaryDto } from '../../categories/dto/category.dto.js';
import { IsInstant, IsSafeText } from '../../common/validation/decorators.js';
import { EventVisibility, TransactionType } from '../../generated/prisma/client.js';
import { UserRefDto } from '../../transactions/dto/transaction.dto.js';

export class CreateEventDto {
  @ApiProperty({ example: 'Jantar no japonês', maxLength: 120 })
  @IsSafeText({ maxLength: 120 })
  title: string;

  @ApiProperty({ example: '2026-10-02T22:00:00-03:00' })
  @IsInstant()
  startAt: string;

  @ApiProperty({ example: '2026-10-02T23:30:00-03:00' })
  @IsInstant()
  endAt: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  allDay?: boolean;

  @ApiPropertyOptional({ enum: EventVisibility, default: EventVisibility.SHARED, description: 'SHARED: every household member sees it; PRIVATE: only you' })
  @IsOptional()
  @IsEnum(EventVisibility)
  visibility?: EventVisibility;

  @ApiPropertyOptional({ example: 'Rua Liberdade, 123', maxLength: 120 })
  @IsOptional()
  @IsSafeText({ maxLength: 120, optional: true })
  location?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsSafeText({ maxLength: 1000, multiline: true, optional: true })
  description?: string;

  @ApiPropertyOptional({ example: '#ec4899' })
  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'color must be a hex color like #ec4899' })
  color?: string;

  @ApiPropertyOptional({ example: 220, description: 'Expected spending for the event' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(999_999_999_999.99)
  estimatedCost?: number;
}

export class UpdateEventDto extends PartialType(CreateEventDto) {}

export class CalendarQueryDto {
  @ApiProperty({ example: '2026-10-01T00:00:00-03:00', description: 'Start of the window (inclusive)' })
  @IsInstant()
  from: string;

  @ApiProperty({ example: '2026-11-01T00:00:00-03:00', description: 'End of the window (exclusive); at most 400 days after from' })
  @IsInstant()
  to: string;
}

export class EventResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'Jantar no japonês' })
  title: string;

  @ApiProperty({ nullable: true, type: String })
  description: string | null;

  @ApiProperty({ nullable: true, type: String })
  location: string | null;

  @ApiProperty({ example: '2026-10-03T01:00:00.000Z' })
  startAt: string;

  @ApiProperty({ example: '2026-10-03T02:30:00.000Z' })
  endAt: string;

  @ApiProperty()
  allDay: boolean;

  @ApiProperty({ enum: EventVisibility })
  visibility: EventVisibility;

  @ApiProperty({ nullable: true, type: String })
  color: string | null;

  @ApiProperty({ example: '220.00', nullable: true, type: String })
  estimatedCost: string | null;

  @ApiProperty({ type: UserRefDto, nullable: true })
  createdBy: UserRefDto | null;

  @ApiProperty({ description: 'Created by the authenticated user' })
  isMine: boolean;
}

export class CalendarBillDto {
  @ApiProperty()
  ruleId: string;

  @ApiProperty({ example: 'Aluguel' })
  description: string;

  @ApiProperty({ example: '1800.00' })
  amount: string;

  @ApiProperty({ enum: TransactionType })
  type: TransactionType;

  @ApiProperty({ example: '2026-10-10' })
  date: string;

  @ApiProperty({ type: CategorySummaryDto, nullable: true, description: 'Null for scheduled transfers' })
  category: CategorySummaryDto | null;

  @ApiProperty({ type: AccountSummaryDto, nullable: true, description: 'Destination of a scheduled transfer (e.g. an investment)' })
  toAccount: AccountSummaryDto | null;

  @ApiProperty({ description: 'The transaction for this occurrence already exists' })
  done: boolean;
}

export class CalendarFeedDto {
  @ApiProperty({ type: [EventResponseDto] })
  events: EventResponseDto[];

  @ApiProperty({ type: [CalendarBillDto], description: 'Recurring income/bills due in the window' })
  bills: CalendarBillDto[];
}
