import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module.js';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard.js';
import { CommonModule } from './common/common.module.js';
import { throttlerOptions } from './common/throttling/throttling.js';
import { BudgetsModule } from './budgets/budgets.module.js';
import { CategoriesModule } from './categories/categories.module.js';
import { validateEnv } from './config/env.validation.js';
import { AccountsModule } from './accounts/accounts.module.js';
import { RecurringModule } from './recurring/recurring.module.js';
import { CalendarModule } from './calendar/calendar.module.js';
import { GoalsModule } from './goals/goals.module.js';
import { HouseholdsModule } from './households/households.module.js';
import { HealthController } from './health/health.controller.js';
import { RootController } from './health/root.controller.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { TransactionsModule } from './transactions/transactions.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: throttlerOptions,
    }),
    CommonModule,
    PrismaModule,
    AuthModule,
    CategoriesModule,
    TransactionsModule,
    BudgetsModule,
    HouseholdsModule,
    AccountsModule,
    RecurringModule,
    GoalsModule,
    CalendarModule,
    ReportsModule,
  ],
  controllers: [RootController, HealthController],
  providers: [
    // Global guards run in this order: rate limit first, then authentication.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
