import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module.js';
import { BudgetsModule } from './budgets/budgets.module.js';
import { CategoriesModule } from './categories/categories.module.js';
import { validateEnv } from './config/env.validation.js';
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
      useFactory: (config: ConfigService) => [
        { ttl: 60_000, limit: config.get<number>('THROTTLE_AUTH_LIMIT', 10) },
      ],
    }),
    PrismaModule,
    AuthModule,
    CategoriesModule,
    TransactionsModule,
    BudgetsModule,
    ReportsModule,
  ],
  controllers: [RootController, HealthController],
})
export class AppModule {}
