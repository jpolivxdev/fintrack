import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsUUID,
  Max,
} from 'class-validator';
import { IsDateOnly, IsSafeText } from '../../common/validation/decorators.js';
import {
  PaginationMetaDto,
  PaginationQueryDto,
} from '../../common/dto/pagination.dto.js';
import { CategorySummaryDto } from '../../categories/dto/category.dto.js';
import { TransactionType } from '../../generated/prisma/client.js';

export class CreateTransactionDto {
  @ApiProperty({ example: 'Supermercado Extra', maxLength: 120 })
  @IsSafeText({ maxLength: 120 })
  description: string;

  @ApiProperty({
    example: 249.9,
    description: 'Positive value with at most 2 decimal places. The sign comes from `type`.',
  })
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @IsPositive()
  @Max(999_999_999_999.99)
  amount: number;

  @ApiProperty({ enum: TransactionType, example: TransactionType.EXPENSE })
  @IsEnum(TransactionType)
  type: TransactionType;

  @ApiProperty({ example: '2026-10-01', description: 'Date in YYYY-MM-DD format' })
  @IsDateOnly()
  date: string;

  @ApiProperty({ example: '3d8f1a2b-9c4e-4b7a-8f6d-1e2c3b4a5d6e' })
  @IsUUID()
  categoryId: string;

  @ApiPropertyOptional({ example: 'Compra do mês', maxLength: 500 })
  @IsOptional()
  @IsSafeText({ maxLength: 500, multiline: true, optional: true })
  notes?: string;
}

export class UpdateTransactionDto extends PartialType(CreateTransactionDto) {}

export const TRANSACTION_SORT_FIELDS = ['date', 'amount', 'description', 'createdAt'] as const;
export type TransactionSortField = (typeof TRANSACTION_SORT_FIELDS)[number];

export class ListTransactionsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: TransactionType })
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ example: '2026-10-01', description: 'Inclusive (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateOnly()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-10-31', description: 'Inclusive (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateOnly()
  endDate?: string;

  @ApiPropertyOptional({ example: 'mercado', description: 'Case-insensitive search in description' })
  @IsOptional()
  @IsSafeText({ maxLength: 120, optional: true })
  search?: string;

  @ApiPropertyOptional({ enum: TRANSACTION_SORT_FIELDS, default: 'date' })
  @IsOptional()
  @IsIn(TRANSACTION_SORT_FIELDS)
  sortBy: TransactionSortField = 'date';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order: 'asc' | 'desc' = 'desc';
}

export class UserRefDto {
  @ApiProperty({ example: '6f1c2b8e-3a4d-4f6b-9c1e-2d3f4a5b6c7d' })
  id: string;

  @ApiProperty({ example: 'Maria' })
  name: string;
}

export class TransactionResponseDto {
  @ApiProperty({ example: '9b2e4c6a-1d3f-4e5a-8b7c-6d5e4f3a2b1c' })
  id: string;

  @ApiProperty({ example: 'Supermercado Extra' })
  description: string;

  @ApiProperty({ example: '249.90', description: 'Decimal string with 2 places' })
  amount: string;

  @ApiProperty({ enum: TransactionType, example: TransactionType.EXPENSE })
  type: TransactionType;

  @ApiProperty({ example: '2026-10-01' })
  date: string;

  @ApiProperty({ example: 'Compra do mês', nullable: true, type: String })
  notes: string | null;

  @ApiProperty({ type: CategorySummaryDto })
  category: CategorySummaryDto;

  @ApiProperty({
    type: UserRefDto,
    nullable: true,
    description: 'Household member who registered it (null if they left and were deleted)',
  })
  createdBy: UserRefDto | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class TransactionTotalsDto {
  @ApiProperty({ example: '5000.00' })
  income: string;

  @ApiProperty({ example: '3120.45' })
  expense: string;

  @ApiProperty({ example: '1879.55', description: 'income - expense' })
  net: string;
}

export class PaginatedTransactionsDto {
  @ApiProperty({ type: [TransactionResponseDto] })
  data: TransactionResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;

  @ApiProperty({
    type: TransactionTotalsDto,
    description: 'Totals over every transaction matching the filters (not just this page)',
  })
  totals: TransactionTotalsDto;
}
