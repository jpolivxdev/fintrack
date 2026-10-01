import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AccountsModule } from '../accounts/accounts.module.js';
import { MaterializeRecurringInterceptor } from './materialize.interceptor.js';
import { RecurringController } from './recurring.controller.js';
import { RecurringService } from './recurring.service.js';

@Module({
  imports: [AccountsModule],
  controllers: [RecurringController],
  providers: [RecurringService, { provide: APP_INTERCEPTOR, useClass: MaterializeRecurringInterceptor }],
  exports: [RecurringService],
})
export class RecurringModule {}
