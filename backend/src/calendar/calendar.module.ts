import { Module } from '@nestjs/common';
import { CalendarSharesController } from './calendar-shares.controller.js';
import { CalendarSharesService } from './calendar-shares.service.js';
import { CalendarController } from './calendar.controller.js';
import { CalendarService } from './calendar.service.js';

@Module({
  controllers: [CalendarController, CalendarSharesController],
  providers: [CalendarService, CalendarSharesService],
})
export class CalendarModule {}
