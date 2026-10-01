import {
  ApiProperty,
  ApiPropertyOptional,
  IntersectionType,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { CategorySummaryDto } from '../../categories/dto/category.dto.js';
import {
  PaginationMetaDto,
  PaginationQueryDto,
} from '../../common/dto/pagination.dto.js';

class MoneyLimit {
  @ApiProperty({ example: 800, description: 'Monthly limit, at most 2 decimal places' })
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @IsPositive()
  @Max(999_999_999_999.99)
  monthlyLimit: number;
}

export class CreateBudgetDto extends MoneyLimit {
  @ApiProperty({ example: '3d8f1a2b-9c4e-4b7a-8f6d-1e2c3b4a5d6e', description: 'An EXPENSE category' })
  @IsUUID()
  categoryId: string;

  @ApiProperty({ example: 2026, minimum: 2000, maximum: 2100 })
  @IsInt()
  @Min(2000)
  @Max(2100)
  year: number;

  @ApiProperty({ example: 10, minimum: 1, maximum: 12 })
  @IsInt()
  @Min(1)
  @Max(12)
  month: number;
}

/** Only the limit can change; a different category or month is a new budget. */
export class UpdateBudgetDto extends MoneyLimit {}

export class MonthQueryDto {
  @ApiPropertyOptional({ example: 2026, description: 'Defaults to the current year' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;

  @ApiPropertyOptional({ example: 10, description: 'Defaults to the current month' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;
}

export class ListBudgetsQueryDto extends IntersectionType(
  PaginationQueryDto,
  MonthQueryDto,
) {}

export class CopyBudgetsDto {
  @ApiProperty({ example: 2026, description: 'Target year' })
  @IsInt()
  @Min(2000)
  @Max(2100)
  year: number;

  @ApiProperty({ example: 11, description: 'Target month; budgets are copied from the month before' })
  @IsInt()
  @Min(1)
  @Max(12)
  month: number;
}

export class BudgetResponseDto {
  @ApiProperty({ example: 'b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e' })
  id: string;

  @ApiProperty({ example: 2026 })
  year: number;

  @ApiProperty({ example: 10 })
  month: number;

  @ApiProperty({ type: CategorySummaryDto })
  category: CategorySummaryDto;

  @ApiProperty({ example: '800.00' })
  monthlyLimit: string;

  @ApiProperty({ example: '652.30', description: 'Expenses in this category during the month' })
  spent: string;

  @ApiProperty({ example: '147.70', description: 'Never negative' })
  remaining: string;

  @ApiProperty({ example: 81.54, description: 'Can exceed 100 when over budget' })
  percentUsed: number;

  @ApiProperty({
    enum: ['ON_TRACK', 'WARNING', 'EXCEEDED'],
    example: 'WARNING',
    description: 'WARNING from 80% of the limit, EXCEEDED above 100%',
  })
  status: 'ON_TRACK' | 'WARNING' | 'EXCEEDED';
}

export class PaginatedBudgetsDto {
  @ApiProperty({ type: [BudgetResponseDto] })
  data: BudgetResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}

export class CopyBudgetsResponseDto {
  @ApiProperty({ example: 4, description: 'Budgets created in the target month' })
  created: number;

  @ApiProperty({ example: 1, description: 'Skipped because the target month already had them' })
  skipped: number;
}
