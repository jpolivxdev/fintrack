import { Module } from '@nestjs/common';
import { HouseholdsController } from './households.controller.js';
import { InviteLookupController } from './invite-lookup.controller.js';
import { HouseholdsService } from './households.service.js';

@Module({
  controllers: [HouseholdsController, InviteLookupController],
  providers: [HouseholdsService],
})
export class HouseholdsModule {}
