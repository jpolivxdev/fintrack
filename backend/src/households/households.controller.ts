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
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { CredentialsThrottle } from '../common/throttling/throttling.js';
import {
  HouseholdResponseDto,
  InviteResponseDto,
  JoinHouseholdDto,
  UpdateHouseholdDto,
} from './dto/household.dto.js';
import { HouseholdsService } from './households.service.js';

@ApiTags('Household')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@Controller('household')
export class HouseholdsController {
  constructor(private readonly households: HouseholdsService) {}

  @Get()
  @ApiOperation({ summary: 'Get your household and its members' })
  @ApiOkResponse({ type: HouseholdResponseDto })
  get(@CurrentUser('id') userId: string) {
    return this.households.get(userId);
  }

  @Patch()
  @ApiOperation({ summary: 'Rename the household (owner only)' })
  @ApiOkResponse({ type: HouseholdResponseDto })
  @ApiForbiddenResponse({ description: 'Only the owner can rename' })
  rename(@CurrentUser('id') userId: string, @Body() dto: UpdateHouseholdDto) {
    return this.households.rename(userId, dto.name);
  }

  @Post('invites')
  @ApiOperation({
    summary: 'Create an invite code (owner only)',
    description: 'Single use, valid for 48 hours. The code is returned once; only its hash is stored.',
  })
  @ApiCreatedResponse({ type: InviteResponseDto })
  @ApiForbiddenResponse({ description: 'Not the owner, or the public demo account' })
  invite(@CurrentUser('id') userId: string) {
    return this.households.createInvite(userId);
  }

  @Post('join')
  @CredentialsThrottle()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Join a household with an invite code',
    description:
      'Your personal data moves into the household: categories with the same name and type are merged; when both have a budget for the same category and month, the household keeps its own.',
  })
  @ApiOkResponse({ type: HouseholdResponseDto })
  @ApiNotFoundResponse({ description: 'Invalid or expired invite code' })
  @ApiConflictResponse({ description: 'Already a member, or you are in another shared household' })
  @ApiTooManyRequestsResponse({ description: 'Too many attempts (5 per 15 min)' })
  join(@CurrentUser('id') userId: string, @Body() dto: JoinHouseholdDto) {
    return this.households.join(userId, dto.code);
  }

  @Post('leave')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Leave the shared household',
    description: 'You start over in a new personal household; shared data stays. If you were the owner, the longest-standing member becomes owner.',
  })
  @ApiOkResponse({ type: HouseholdResponseDto, description: 'Your new personal household' })
  @ApiConflictResponse({ description: 'You are the only member' })
  leave(@CurrentUser('id') userId: string) {
    return this.households.leave(userId);
  }

  @Delete('members/:userId')
  @ApiOperation({ summary: 'Remove a member (owner only)', description: 'The member moves to a new personal household.' })
  @ApiOkResponse({ type: HouseholdResponseDto })
  @ApiForbiddenResponse({ description: 'Only the owner can remove members' })
  @ApiNotFoundResponse({ description: 'Member not found' })
  remove(@CurrentUser('id') userId: string, @Param('userId', ParseUUIDPipe) memberUserId: string) {
    return this.households.removeMember(userId, memberUserId);
  }
}
