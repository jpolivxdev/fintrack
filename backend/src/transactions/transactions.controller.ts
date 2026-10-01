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
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator.js';
import {
  CreateTransactionDto,
  ListTransactionsQueryDto,
  PaginatedTransactionsDto,
  TransactionResponseDto,
  UpdateTransactionDto,
} from './dto/transaction.dto.js';
import { TransactionsService } from './transactions.service.js';

@ApiTags('Transactions')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a transaction' })
  @ApiCreatedResponse({ type: TransactionResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid payload or type does not match the category' })
  @ApiNotFoundResponse({ description: 'Category not found' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTransactionDto) {
    return this.transactions.create(user.householdId, dto, user.id);
  }

  @Get()
  @ApiOperation({
    summary: 'List transactions',
    description:
      'Paginated, filterable by type/category/period/text and sortable. Also returns the totals of everything matching the filters.',
  })
  @ApiOkResponse({ type: PaginatedTransactionsDto })
  findAll(@CurrentUser('householdId') householdId: string, @Query() query: ListTransactionsQueryDto) {
    return this.transactions.findAll(householdId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a transaction by id' })
  @ApiOkResponse({ type: TransactionResponseDto })
  @ApiNotFoundResponse({ description: 'Transaction not found' })
  findOne(@CurrentUser('householdId') householdId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.transactions.findOne(householdId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a transaction' })
  @ApiOkResponse({ type: TransactionResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid payload or type does not match the category' })
  @ApiNotFoundResponse({ description: 'Transaction or category not found' })
  update(
    @CurrentUser('householdId') householdId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTransactionDto,
  ) {
    return this.transactions.update(householdId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a transaction' })
  @ApiNoContentResponse({ description: 'Transaction deleted' })
  @ApiNotFoundResponse({ description: 'Transaction not found' })
  remove(@CurrentUser('householdId') householdId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.transactions.remove(householdId, id);
  }
}
