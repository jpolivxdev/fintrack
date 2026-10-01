import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { IsDateOnly } from '../../common/validation/decorators.js';
import { BudgetResponseDto, MonthQueryDto } from '../../budgets/dto/budget.dto.js';
import { TransactionType } from '../../generated/prisma/client.js';

export { MonthQueryDto };

export class MonthlyReportQueryDto extends MonthQueryDto {
  @ApiPropertyOptional({
    example: 6,
    minimum: 1,
    maximum: 24,
    default: 6,
    description: 'How many months to return, ending at year/month (default: current month)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  months: number = 6;
}

export class CategoryReportQueryDto {
  @ApiPropertyOptional({ enum: TransactionType, default: TransactionType.EXPENSE })
  @IsOptional()
  @IsEnum(TransactionType)
  type: TransactionType = TransactionType.EXPENSE;

  @ApiPropertyOptional({ example: '2026-10-01', description: 'Inclusive. Defaults to the first day of the current month' })
  @IsOptional()
  @IsDateOnly()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-10-31', description: 'Inclusive. Defaults to the last day of the current month' })
  @IsOptional()
  @IsDateOnly()
  endDate?: string;
}

class PeriodTotalsDto {
  @ApiProperty({ example: '5000.00' })
  income: string;

  @ApiProperty({ example: '3200.00' })
  expense: string;

  @ApiProperty({ example: '1800.00' })
  net: string;
}

export class SummaryReportDto extends PeriodTotalsDto {
  @ApiProperty({ example: 2026 })
  year: number;

  @ApiProperty({ example: 10 })
  month: number;

  @ApiProperty({
    example: '12450.75',
    description: 'All-time accumulated balance up to the end of the month',
  })
  balance: string;

  @ApiProperty({ example: 36, nullable: true, type: Number, description: '% of income saved; null without income' })
  savingsRate: number | null;

  @ApiProperty({ example: 42 })
  transactionCount: number;

  @ApiProperty({ type: PeriodTotalsDto })
  previousMonth: PeriodTotalsDto;

  @ApiProperty({ example: 4.17, nullable: true, type: Number, description: '% change vs previous month' })
  incomeChange: number | null;

  @ApiProperty({ example: -12.5, nullable: true, type: Number, description: '% change vs previous month' })
  expenseChange: number | null;
}

export class MonthlyPointDto extends PeriodTotalsDto {
  @ApiProperty({ example: '2026-10' })
  period: string;

  @ApiProperty({ example: 2026 })
  year: number;

  @ApiProperty({ example: 10 })
  month: number;

  @ApiProperty({ example: '12450.75', description: 'Accumulated balance at month end' })
  balance: string;
}

export class MonthlyReportDto {
  @ApiProperty({ type: [MonthlyPointDto] })
  months: MonthlyPointDto[];
}

export class CategoryBreakdownItemDto {
  @ApiProperty({ example: '3d8f1a2b-9c4e-4b7a-8f6d-1e2c3b4a5d6e' })
  categoryId: string;

  @ApiProperty({ example: 'Alimentação' })
  name: string;

  @ApiProperty({ example: '#ef4444', nullable: true, type: String })
  color: string | null;

  @ApiProperty({ example: 'utensils', nullable: true, type: String })
  icon: string | null;

  @ApiProperty({ example: '1250.40' })
  total: string;

  @ApiProperty({ example: 18 })
  count: number;

  @ApiProperty({ example: 39.07, description: 'Share of the period total' })
  percentage: number;
}

export class CategoryReportDto {
  @ApiProperty({ enum: TransactionType })
  type: TransactionType;

  @ApiProperty({ example: '2026-10-01' })
  startDate: string;

  @ApiProperty({ example: '2026-10-31' })
  endDate: string;

  @ApiProperty({ example: '3200.00' })
  total: string;

  @ApiProperty({ type: [CategoryBreakdownItemDto], description: 'Sorted by total, highest first' })
  categories: CategoryBreakdownItemDto[];
}

class BudgetTotalsDto {
  @ApiProperty({ example: '3000.00' })
  limit: string;

  @ApiProperty({ example: '2450.00' })
  spent: string;

  @ApiProperty({ example: '550.00' })
  remaining: string;

  @ApiProperty({ example: 81.67 })
  percentUsed: number;
}

export class BudgetVsActualReportDto {
  @ApiProperty({ example: 2026 })
  year: number;

  @ApiProperty({ example: 10 })
  month: number;

  @ApiProperty({ type: [BudgetResponseDto] })
  budgets: BudgetResponseDto[];

  @ApiProperty({ type: BudgetTotalsDto, description: 'Sum over budgeted categories only' })
  totals: BudgetTotalsDto;

  @ApiProperty({ example: '320.00', description: 'Expenses in categories without a budget this month' })
  unbudgetedSpent: string;

  @ApiProperty({ example: 1 })
  exceededCount: number;
}
