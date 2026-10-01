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
  CreateTransferDto,
  ListTransfersQueryDto,
  PaginatedTransfersDto,
  TransferResponseDto,
  UpdateTransferDto,
} from './dto/transfer.dto.js';
import { TransfersService } from './transfers.service.js';

@ApiTags('Transfers')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@Controller('transfers')
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}

  @Get()
  @ApiOperation({ summary: 'List transfers between accounts' })
  @ApiOkResponse({ type: PaginatedTransfersDto })
  findAll(@CurrentUser('householdId') householdId: string, @Query() query: ListTransfersQueryDto) {
    return this.transfers.findAll(householdId, query);
  }

  @Post()
  @ApiOperation({
    summary: 'Move money between two accounts',
    description: 'E.g. paying the credit card bill. Transfers never count as income or expense.',
  })
  @ApiCreatedResponse({ type: TransferResponseDto })
  @ApiBadRequestResponse({ description: 'Same account on both sides, or an archived account' })
  @ApiNotFoundResponse({ description: 'Account not found' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTransferDto) {
    return this.transfers.create(user.householdId, dto, user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Change amount, date or description of a transfer' })
  @ApiOkResponse({ type: TransferResponseDto })
  @ApiNotFoundResponse({ description: 'Transfer not found' })
  update(
    @CurrentUser('householdId') householdId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTransferDto,
  ) {
    return this.transfers.update(householdId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a transfer' })
  @ApiNoContentResponse({ description: 'Transfer deleted' })
  @ApiNotFoundResponse({ description: 'Transfer not found' })
  remove(@CurrentUser('householdId') householdId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.transfers.remove(householdId, id);
  }
}
