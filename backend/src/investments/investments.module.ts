import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module.js';
import { InvestmentsController } from './investments.controller.js';
import { InvestmentsService } from './investments.service.js';
import { BcbRatesProvider, MARKET_RATES_PROVIDER, MarketDataService } from './market-data.js';

@Module({
  imports: [AccountsModule],
  controllers: [InvestmentsController],
  providers: [InvestmentsService, MarketDataService, { provide: MARKET_RATES_PROVIDER, useClass: BcbRatesProvider }],
  exports: [InvestmentsService],
})
export class InvestmentsModule {}
