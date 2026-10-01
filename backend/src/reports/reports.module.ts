import { Module } from '@nestjs/common';
import { BudgetsModule } from '../budgets/budgets.module.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

@Module({
  imports: [BudgetsModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
