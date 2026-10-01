import { Module } from '@nestjs/common';
import { HouseholdsController } from './households.controller.js';
import { HouseholdsService } from './households.service.js';

@Module({
  controllers: [HouseholdsController],
  providers: [HouseholdsService],
})
export class HouseholdsModule {}
