import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { BudgetsService } from './budgets.service.js';
import {
  BudgetResponseDto,
  CopyBudgetsDto,
  CopyBudgetsResponseDto,
  CreateBudgetDto,
  ListBudgetsQueryDto,
  PaginatedBudgetsDto,
  UpdateBudgetDto,
} from './dto/budget.dto.js';

@ApiTags('Budgets')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@Controller('budgets')
export class BudgetsController {
  constructor(private readonly budgets: BudgetsService) {}

  @Post()
  @ApiOperation({ summary: 'Set a monthly limit for an expense category' })
  @ApiCreatedResponse({ type: BudgetResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid payload or category is not an EXPENSE category' })
  @ApiNotFoundResponse({ description: 'Category not found' })
  @ApiConflictResponse({ description: 'The category already has a budget for that month' })
  create(@CurrentUser('id') userId: string, @Body() dto: CreateBudgetDto) {
    return this.budgets.create(userId, dto);
  }

  @Post('copy-previous')
  @ApiOperation({
    summary: "Copy last month's budgets into a month",
    description: 'Categories that already have a budget in the target month are skipped.',
  })
  @ApiCreatedResponse({ type: CopyBudgetsResponseDto })
  copyPrevious(@CurrentUser('id') userId: string, @Body() dto: CopyBudgetsDto) {
    return this.budgets.copyFromPreviousMonth(userId, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List the budgets of a month with their progress',
    description: 'Each budget includes spent, remaining, percentUsed and status. Defaults to the current month.',
  })
  @ApiOkResponse({ type: PaginatedBudgetsDto })
  findAll(@CurrentUser('id') userId: string, @Query() query: ListBudgetsQueryDto) {
    return this.budgets.findAll(userId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a budget by id' })
  @ApiOkResponse({ type: BudgetResponseDto })
  @ApiNotFoundResponse({ description: 'Budget not found' })
  findOne(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.budgets.findOne(userId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Change the monthly limit of a budget' })
  @ApiOkResponse({ type: BudgetResponseDto })
  @ApiNotFoundResponse({ description: 'Budget not found' })
  update(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBudgetDto,
  ) {
    return this.budgets.update(userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a budget' })
  @ApiNoContentResponse({ description: 'Budget deleted' })
  @ApiNotFoundResponse({ description: 'Budget not found' })
  remove(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.budgets.remove(userId, id);
  }
}
