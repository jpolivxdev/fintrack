import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
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
import { InviteResponseDto, JoinHouseholdDto } from '../households/dto/household.dto.js';
import { CalendarSharesService } from './calendar-shares.service.js';
import { CalendarSharesDto } from './dto/calendar-share.dto.js';

@ApiTags('Calendar sharing')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@Controller('calendar/shares')
export class CalendarSharesController {
  constructor(private readonly shares: CalendarSharesService) {}

  @Get()
  @ApiOperation({ summary: 'People you share your calendar with (finances stay separate)' })
  @ApiOkResponse({ type: CalendarSharesDto })
  list(@CurrentUser('id') userId: string) {
    return this.shares.list(userId);
  }

  @Post('invites')
  @ApiOperation({
    summary: 'Create a calendar-sharing code',
    description: 'Single use, valid for 48 hours. Only shared events become visible; finances are never shared.',
  })
  @ApiCreatedResponse({ type: InviteResponseDto })
  @ApiForbiddenResponse({ description: 'The public demo account' })
  invite(@CurrentUser('id') userId: string) {
    return this.shares.createInvite(userId);
  }

  @Post('join')
  @CredentialsThrottle()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start sharing calendars with whoever created the code' })
  @ApiOkResponse({ type: CalendarSharesDto })
  @ApiNotFoundResponse({ description: 'Invalid or expired invite code' })
  @ApiConflictResponse({ description: 'Own code, or already sharing' })
  @ApiTooManyRequestsResponse({ description: 'Too many attempts (5 per 15 min)' })
  join(@CurrentUser('id') userId: string, @Body() dto: JoinHouseholdDto) {
    return this.shares.join(userId, dto.code);
  }

  @Delete(':userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Stop sharing calendars with someone (either side can do it)' })
  @ApiOkResponse({ type: CalendarSharesDto })
  @ApiNotFoundResponse({ description: 'Not sharing with this person' })
  remove(@CurrentUser('id') userId: string, @Param('userId', ParseUUIDPipe) partnerId: string) {
    return this.shares.remove(userId, partnerId);
  }
}
