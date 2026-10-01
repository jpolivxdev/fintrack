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
import { IncludeArchivedQueryDto } from '../common/dto/include-archived.dto.js';
import { CreateContributionDto, CreateGoalDto, GoalDetailDto, GoalResponseDto, UpdateGoalDto } from './dto/goal.dto.js';
import { GoalsService } from './goals.service.js';

@ApiTags('Goals')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@Controller('goals')
export class GoalsController {
  constructor(private readonly goals: GoalsService) {}

  @Get()
  @ApiOperation({ summary: 'List savings goals with progress and projection' })
  @ApiOkResponse({ type: [GoalResponseDto] })
  findAll(@CurrentUser('householdId') householdId: string, @Query() query: IncludeArchivedQueryDto) {
    return this.goals.findAll(householdId, query.includeArchived);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a goal with its contributions' })
  @ApiOkResponse({ type: GoalDetailDto })
  @ApiNotFoundResponse({ description: 'Goal not found' })
  findOne(@CurrentUser('householdId') householdId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.goals.findOne(householdId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a savings goal' })
  @ApiCreatedResponse({ type: GoalDetailDto })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateGoalDto) {
    return this.goals.create(user.householdId, dto, user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update or archive a goal' })
  @ApiOkResponse({ type: GoalDetailDto })
  update(
    @CurrentUser('householdId') householdId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGoalDto,
  ) {
    return this.goals.update(householdId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a goal and its contributions' })
  @ApiNoContentResponse({ description: 'Goal deleted' })
  remove(@CurrentUser('householdId') householdId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.goals.remove(householdId, id);
  }

  @Post(':id/contributions')
  @ApiOperation({ summary: 'Save into (positive) or withdraw from (negative) a goal' })
  @ApiCreatedResponse({ type: GoalDetailDto })
  @ApiBadRequestResponse({ description: 'Withdrawal larger than the saved amount' })
  contribute(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateContributionDto) {
    return this.goals.addContribution(user.householdId, id, dto, user.id);
  }

  @Delete(':id/contributions/:contributionId')
  @ApiOperation({ summary: 'Remove a contribution' })
  @ApiOkResponse({ type: GoalDetailDto })
  removeContribution(
    @CurrentUser('householdId') householdId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('contributionId', ParseUUIDPipe) contributionId: string,
  ) {
    return this.goals.removeContribution(householdId, id, contributionId);
  }
}
