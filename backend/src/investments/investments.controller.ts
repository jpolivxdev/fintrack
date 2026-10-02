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
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator.js';
import {
  CreateInvestmentDto,
  CreateValuationDto,
  HistoryPointDto,
  HistoryQueryDto,
  InvestmentDetailDto,
  PortfolioDto,
  UpdateInvestmentDto,
} from './dto/investment.dto.js';
import { InvestmentsService } from './investments.service.js';

@ApiTags('Investments')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@Controller('investments')
export class InvestmentsController {
  constructor(private readonly investments: InvestmentsService) {}

  @Get()
  @ApiOperation({
    summary: 'Portfolio: estimated value, profit, allocation and comparison with CDI/IPCA',
    description: 'Values are gross (before income tax), estimated with CDI and IPCA published by Banco Central.',
  })
  @ApiOkResponse({ type: PortfolioDto })
  portfolio(@CurrentUser('householdId') householdId: string) {
    return this.investments.portfolio(householdId);
  }

  @Get('history')
  @ApiOperation({ summary: 'Month-end evolution of value, invested, and the same flows in CDI and IPCA' })
  @ApiOkResponse({ type: [HistoryPointDto] })
  history(@CurrentUser('householdId') householdId: string, @Query() query: HistoryQueryDto) {
    return this.investments.history(householdId, query.months, query.investmentId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Investment with valuations, movements and scheduled contributions' })
  @ApiOkResponse({ type: InvestmentDetailDto })
  @ApiNotFoundResponse({ description: 'Investment not found' })
  findOne(@CurrentUser('householdId') householdId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.investments.findOne(householdId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create an investment (new account) or start tracking an existing savings account' })
  @ApiCreatedResponse({ type: InvestmentDetailDto })
  @ApiBadRequestResponse({ description: 'Invalid rate for the yield mode, future date...' })
  @ApiConflictResponse({ description: 'Account already tracked' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateInvestmentDto) {
    return this.investments.create(user.householdId, dto, user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an investment (yield mode, rate, name...) or archive it' })
  @ApiOkResponse({ type: InvestmentDetailDto })
  update(
    @CurrentUser('householdId') householdId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInvestmentDto,
  ) {
    return this.investments.update(householdId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an investment that has no history (otherwise archive it)' })
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiConflictResponse({ description: 'Has movements or scheduled contributions' })
  remove(@CurrentUser('householdId') householdId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.investments.remove(householdId, id);
  }

  @Post(':id/valuations')
  @ApiOperation({ summary: 'Record the value shown on the statement for a day (replaces that day\'s value)' })
  @ApiCreatedResponse({ type: InvestmentDetailDto })
  addValuation(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateValuationDto) {
    return this.investments.addValuation(user.householdId, id, dto, user.id);
  }

  @Delete(':id/valuations/:valuationId')
  @ApiOperation({ summary: 'Remove a recorded valuation' })
  @ApiOkResponse({ type: InvestmentDetailDto })
  removeValuation(
    @CurrentUser('householdId') householdId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('valuationId', ParseUUIDPipe) valuationId: string,
  ) {
    return this.investments.removeValuation(householdId, id, valuationId);
  }
}
