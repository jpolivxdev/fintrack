import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { MonthQueryDto } from '../budgets/dto/budget.dto.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { InsightsService } from './insights.service.js';

class InsightDto {
  @ApiProperty({ example: 'CATEGORY_SPIKE:3d8f1a2b-9c4e-4b7a-8f6d-1e2c3b4a5d6e' })
  id: string;

  @ApiProperty({
    example: 'CATEGORY_SPIKE',
    enum: [
      'CATEGORY_SPIKE', 'CATEGORY_DROP', 'BUDGET_EXCEEDED', 'BUDGET_WARNING', 'BUDGET_PACE', 'SAVINGS_GOOD',
      'SPENT_MORE_THAN_EARNED', 'BIGGEST_EXPENSE', 'UPCOMING_BILLS', 'GOAL_BEHIND', 'GOAL_COMPLETED', 'UNBUDGETED_SPENDING',
    ],
  })
  kind: string;

  @ApiProperty({ enum: ['danger', 'warning', 'positive', 'info'] })
  severity: string;

  @ApiProperty({
    example: { categoryName: 'Lazer', current: '500.00', average: '300.00', changePercent: 66.67 },
    description: 'Structured facts; clients phrase them in their own language',
  })
  data: Record<string, string | number | null>;
}

class InsightsResponseDto {
  @ApiProperty({ example: 2026 })
  year: number;

  @ApiProperty({ example: 10 })
  month: number;

  @ApiProperty({ type: [InsightDto], description: 'Sorted by severity: danger, warning, positive, info' })
  insights: InsightDto[];
}

@ApiTags('Insights')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@Controller('insights')
export class InsightsController {
  constructor(private readonly insights: InsightsService) {}

  @Get()
  @ApiOperation({
    summary: 'Automatic insights for a month',
    description:
      'Spending spikes vs the 3-month average, budget pace and overruns, savings, biggest expense, bills due this week, goals behind schedule and spending outside budgets.',
  })
  @ApiOkResponse({ type: InsightsResponseDto })
  forMonth(@CurrentUser('householdId') householdId: string, @Query() query: MonthQueryDto) {
    return this.insights.forMonth(householdId, query.year, query.month);
  }
}
