import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Header,
  Res,
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
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator.js';
import {
  CreateTransactionDto,
  ListTransactionsQueryDto,
  RemoveTransactionQueryDto,
  PaginatedTransactionsDto,
  TransactionResponseDto,
  UpdateTransactionDto,
} from './dto/transaction.dto.js';
import {
  ExportTransactionsQueryDto,
  ImportResultDto,
  ImportTransactionsDto,
  MAX_IMPORT_ROWS,
} from './dto/transaction-io.dto.js';
import type { Response } from 'express';
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

  // Declared before ':id' so "export" is not parsed as an id.
  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiProduces('text/csv')
  @ApiOperation({
    summary: 'Export transactions as CSV',
    description: "Brazilian Excel format (';' separator, decimal comma, dd/mm/yyyy, UTF-8 BOM). Text cells are protected against formula injection.",
  })
  @ApiOkResponse({ description: 'CSV file', schema: { type: 'string' } })
  async export(
    @CurrentUser('householdId') householdId: string,
    @Query() query: ExportTransactionsQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const { filename, content } = await this.transactions.exportCsv(householdId, query);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return content;
  }

  @Post('import')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Import a bank statement',
    description: `Rows parsed from CSV/OFX by the client (max ${MAX_IMPORT_ROWS}). Valid rows are created, invalid ones reported, duplicates skipped.`,
  })
  @ApiOkResponse({ type: ImportResultDto })
  importRows(@CurrentUser() user: AuthUser, @Body() dto: ImportTransactionsDto) {
    return this.transactions.importRows(user.householdId, dto, user.id);
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
  @ApiOperation({
    summary: 'Delete a transaction',
    description: 'For installment purchases, `scope` can also remove the following installments or the whole purchase.',
  })
  @ApiNoContentResponse({ description: 'Transaction deleted' })
  @ApiNotFoundResponse({ description: 'Transaction not found' })
  async remove(
    @CurrentUser('householdId') householdId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: RemoveTransactionQueryDto,
  ): Promise<void> {
    await this.transactions.remove(householdId, id, query.scope);
  }
}
