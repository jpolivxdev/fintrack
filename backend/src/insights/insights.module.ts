import { Module } from '@nestjs/common';
import { BudgetsModule } from '../budgets/budgets.module.js';
import { GoalsModule } from '../goals/goals.module.js';
import { RecurringModule } from '../recurring/recurring.module.js';
import { InsightsController } from './insights.controller.js';
import { InsightsService } from './insights.service.js';

@Module({
  imports: [BudgetsModule, GoalsModule, RecurringModule],
  controllers: [InsightsController],
  providers: [InsightsService],
})
export class InsightsModule {}
