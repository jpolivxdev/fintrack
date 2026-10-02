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
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator.js';
import { AccountsService } from './accounts.service.js';
import {
  AccountListDto,
  AccountResponseDto,
  CreateAccountDto,
  ListAccountsQueryDto,
  UpdateAccountDto,
} from './dto/account.dto.js';

@ApiTags('Accounts')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  @ApiOperation({ summary: 'List accounts with their balances' })
  @ApiOkResponse({ type: AccountListDto })
  findAll(@CurrentUser('householdId') householdId: string, @Query() query: ListAccountsQueryDto) {
    return this.accounts.findAll(householdId, query.includeArchived);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an account' })
  @ApiOkResponse({ type: AccountResponseDto })
  @ApiNotFoundResponse({ description: 'Account not found' })
  findOne(@CurrentUser('householdId') householdId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.accounts.findOne(householdId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create an account (checking, savings, credit card, cash, investment)' })
  @ApiCreatedResponse({ type: AccountResponseDto })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAccountDto) {
    return this.accounts.create(user.householdId, dto, user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update or archive an account' })
  @ApiOkResponse({ type: AccountResponseDto })
  @ApiConflictResponse({ description: 'Cannot archive the last active account' })
  update(
    @CurrentUser('householdId') householdId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAccountDto,
  ) {
    return this.accounts.update(householdId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an account without history' })
  @ApiNoContentResponse({ description: 'Account deleted' })
  @ApiConflictResponse({ description: 'Account has history (archive it) or is the last active one' })
  remove(@CurrentUser('householdId') householdId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.accounts.remove(householdId, id);
  }
}
