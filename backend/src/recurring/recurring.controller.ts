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
  CreateRecurringDto,
  ListRecurringQueryDto,
  MoveToInvestmentDto,
  RecurringResponseDto,
  UpcomingOccurrenceDto,
  UpcomingQueryDto,
  UpdateRecurringDto,
} from './dto/recurring.dto.js';
import { RecurringService } from './recurring.service.js';

@ApiTags('Recurring')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@Controller('recurring')
export class RecurringController {
  constructor(private readonly recurring: RecurringService) {}

  @Get()
  @ApiOperation({ summary: 'List recurring rules' })
  @ApiOkResponse({ type: [RecurringResponseDto] })
  findAll(@CurrentUser('householdId') householdId: string, @Query() query: ListRecurringQueryDto) {
    return this.recurring.findAll(householdId, query.includeInactive ?? true);
  }

  @Get('upcoming')
  @ApiOperation({ summary: 'Occurrences due in the next N days (not yet created)' })
  @ApiOkResponse({ type: [UpcomingOccurrenceDto] })
  upcoming(@CurrentUser('householdId') householdId: string, @Query() query: UpcomingQueryDto) {
    return this.recurring.upcoming(householdId, query.days);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a recurring rule' })
  @ApiOkResponse({ type: RecurringResponseDto })
  @ApiNotFoundResponse({ description: 'Recurring rule not found' })
  findOne(@CurrentUser('householdId') householdId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.recurring.findOne(householdId, id);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a recurring rule',
    description: 'Occurrences up to today are created immediately; later ones as their date arrives.',
  })
  @ApiCreatedResponse({ type: RecurringResponseDto })
  @ApiBadRequestResponse({ description: 'Type/category mismatch or end before start' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRecurringDto) {
    return this.recurring.create(user.householdId, dto, user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update, pause or resume a rule (affects future occurrences only)' })
  @ApiOkResponse({ type: RecurringResponseDto })
  update(
    @CurrentUser('householdId') householdId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRecurringDto,
  ) {
    return this.recurring.update(householdId, id, dto);
  }

  @Post(':id/move-to-investment')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Turn an expense rule into scheduled contributions to an investment',
    description: 'Keeps the schedule. With convertPast, the expenses it already generated become transfers too.',
  })
  @ApiOkResponse({ type: RecurringResponseDto })
  @ApiNotFoundResponse({ description: 'Rule or investment not found' })
  moveToInvestment(
    @CurrentUser('householdId') householdId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MoveToInvestmentDto,
  ) {
    return this.recurring.moveToInvestment(householdId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a rule (generated transactions are kept)' })
  @ApiNoContentResponse({ description: 'Rule deleted' })
  remove(@CurrentUser('householdId') householdId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.recurring.remove(householdId, id);
  }
}
