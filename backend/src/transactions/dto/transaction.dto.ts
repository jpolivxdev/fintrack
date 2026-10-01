import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
} from 'class-validator';
import {
  PaginationMetaDto,
  PaginationQueryDto,
} from '../../common/dto/pagination.dto.js';
import { CategorySummaryDto } from '../../categories/dto/category.dto.js';
import { TransactionType } from '../../generated/prisma/client.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateTransactionDto {
  @ApiProperty({ example: 'Supermercado Extra', maxLength: 120 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
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
  @IsDateString({ strict: true })
  date: string;

  @ApiProperty({ example: '3d8f1a2b-9c4e-4b7a-8f6d-1e2c3b4a5d6e' })
  @IsUUID()
  categoryId: string;

  @ApiPropertyOptional({ example: 'Compra do mês', maxLength: 500 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
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
  @IsDateString({ strict: true })
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-10-31', description: 'Inclusive (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString({ strict: true })
  endDate?: string;

  @ApiPropertyOptional({ example: 'mercado', description: 'Case-insensitive search in description' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
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
