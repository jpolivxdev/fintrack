import { Module } from '@nestjs/common';
import { AccountsController } from './accounts.controller.js';
import { AccountsService } from './accounts.service.js';
import { TransfersController } from './transfers.controller.js';
import { TransfersService } from './transfers.service.js';

@Module({
  controllers: [AccountsController, TransfersController],
  providers: [AccountsService, TransfersService],
  exports: [AccountsService],
})
export class AccountsModule {}
