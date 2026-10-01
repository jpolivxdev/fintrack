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
import { CalendarService } from './calendar.service.js';
import {
  CalendarFeedDto,
  CalendarQueryDto,
  CreateEventDto,
  EventResponseDto,
  UpdateEventDto,
} from './dto/event.dto.js';

@ApiTags('Calendar')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@Controller()
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  @Get('calendar')
  @ApiOperation({
    summary: 'Calendar feed for a window',
    description: 'Events visible to you (shared + your private ones) and recurring bills/income due in the window.',
  })
  @ApiOkResponse({ type: CalendarFeedDto })
  @ApiBadRequestResponse({ description: 'Invalid or too large window' })
  feed(@CurrentUser() user: AuthUser, @Query() query: CalendarQueryDto) {
    return this.calendar.feed(user, query.from, query.to);
  }

  @Post('events')
  @ApiOperation({ summary: 'Create an event (shared with the household by default)' })
  @ApiCreatedResponse({ type: EventResponseDto })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateEventDto) {
    return this.calendar.create(user, dto);
  }

  @Get('events/:id')
  @ApiOperation({ summary: 'Get an event' })
  @ApiOkResponse({ type: EventResponseDto })
  @ApiNotFoundResponse({ description: 'Event not found (or private to someone else)' })
  findOne(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.calendar.findOne(user, id);
  }

  @Patch('events/:id')
  @ApiOperation({ summary: 'Update an event' })
  @ApiOkResponse({ type: EventResponseDto })
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateEventDto) {
    return this.calendar.update(user, id, dto);
  }

  @Delete('events/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an event' })
  @ApiNoContentResponse({ description: 'Event deleted' })
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.calendar.remove(user, id);
  }
}
