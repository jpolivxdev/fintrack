import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import {
  BudgetVsActualReportDto,
  CategoryReportDto,
  CategoryReportQueryDto,
  MonthlyReportDto,
  MonthlyReportQueryDto,
  MonthQueryDto,
  SummaryReportDto,
} from './dto/report.dto.js';
import { ReportsService } from './reports.service.js';

@ApiTags('Reports')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('summary')
  @ApiOperation({
    summary: 'Monthly summary',
    description:
      'Income, expense, net, accumulated balance and savings rate for a month, with % change vs the previous month.',
  })
  @ApiOkResponse({ type: SummaryReportDto })
  summary(@CurrentUser('householdId') householdId: string, @Query() query: MonthQueryDto) {
    return this.reports.summary(householdId, query);
  }

  @Get('monthly')
  @ApiOperation({
    summary: 'Monthly evolution',
    description:
      'Continuous series (empty months are zero) of income, expense, net and running balance.',
  })
  @ApiOkResponse({ type: MonthlyReportDto })
  monthly(@CurrentUser('householdId') householdId: string, @Query() query: MonthlyReportQueryDto) {
    return this.reports.monthly(householdId, query);
  }

  @Get('by-category')
  @ApiOperation({
    summary: 'Totals by category',
    description: 'Breakdown of a period (default: current month) per category, with percentages.',
  })
  @ApiOkResponse({ type: CategoryReportDto })
  byCategory(@CurrentUser('householdId') householdId: string, @Query() query: CategoryReportQueryDto) {
    return this.reports.byCategory(householdId, query);
  }

  @Get('budget-vs-actual')
  @ApiOperation({
    summary: 'Budget vs actual',
    description:
      'Each budget of the month with spent/remaining/status, overall totals and spending outside any budget.',
  })
  @ApiOkResponse({ type: BudgetVsActualReportDto })
  budgetVsActual(@CurrentUser('householdId') householdId: string, @Query() query: MonthQueryDto) {
    return this.reports.budgetVsActual(householdId, query);
  }
}
