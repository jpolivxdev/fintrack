import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { AccountSummaryDto } from '../../accounts/dto/account.dto.js';
import { IsDateOnly, IsSafeText } from '../../common/validation/decorators.js';
import { InvestmentClass, YieldMode } from '../../generated/prisma/client.js';

class InvestmentProfileFields {
  @ApiProperty({ enum: InvestmentClass, example: InvestmentClass.FIXED_INCOME })
  @IsEnum(InvestmentClass)
  assetClass: InvestmentClass;

  @ApiProperty({ enum: YieldMode, example: YieldMode.CDI_PERCENT })
  @IsEnum(YieldMode)
  yieldMode: YieldMode;

  @ApiPropertyOptional({
    example: 110,
    description: '% of CDI (CDI_PERCENT, 1–300) or % per year (FIXED_RATE / IPCA_PLUS, -50–100). Omit for MANUAL.',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4, allowNaN: false, allowInfinity: false })
  @Min(-50)
  @Max(300)
  rate?: number;

  @ApiPropertyOptional({ example: '2028-01-01', nullable: true, type: String })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsDateOnly()
  maturityDate?: string | null;
}

export class CreateInvestmentDto extends InvestmentProfileFields {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Track an existing savings/investment account instead of creating a new one',
  })
  @IsOptional()
  @IsUUID()
  accountId?: string;

  @ApiPropertyOptional({ example: 'CDB Banco Inter', maxLength: 40, description: 'Required unless accountId is given' })
  @ValidateIf((o: CreateInvestmentDto) => !o.accountId)
  @IsSafeText({ maxLength: 40 })
  name?: string;

  @ApiPropertyOptional({ example: '2026-03-10', description: 'When the initial amount was invested (defaults to today)' })
  @IsOptional()
  @IsDateOnly()
  startDate?: string;

  @ApiPropertyOptional({ example: 5000, description: 'Amount already invested on startDate' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @IsPositive()
  @Max(999_999_999_999.99)
  initialAmount?: number;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'If set, the initial amount is a transfer out of this account (otherwise it was already invested)',
  })
  @IsOptional()
  @IsUUID()
  fromAccountId?: string;

  @ApiPropertyOptional({ example: '#22c55e' })
  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'color must be a hex color like #8b5cf6' })
  color?: string;
}

export class UpdateInvestmentDto {
  @ApiPropertyOptional({ maxLength: 40 })
  @IsOptional()
  @IsSafeText({ maxLength: 40 })
  name?: string;

  @ApiPropertyOptional({ enum: InvestmentClass })
  @IsOptional()
  @IsEnum(InvestmentClass)
  assetClass?: InvestmentClass;

  @ApiPropertyOptional({ enum: YieldMode })
  @IsOptional()
  @IsEnum(YieldMode)
  yieldMode?: YieldMode;

  @ApiPropertyOptional({ example: 110, nullable: true, type: Number })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsNumber({ maxDecimalPlaces: 4, allowNaN: false, allowInfinity: false })
  @Min(-50)
  @Max(300)
  rate?: number | null;

  @ApiPropertyOptional({ example: '2028-01-01', nullable: true, type: String })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsDateOnly()
  maturityDate?: string | null;

  @ApiPropertyOptional({ example: '#22c55e' })
  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'color must be a hex color like #8b5cf6' })
  color?: string;

  @ApiPropertyOptional({ description: 'Archive when fully redeemed (history is kept)' })
  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}

export class CreateValuationDto {
  @ApiProperty({ example: '2026-09-30', description: 'Day the value was read on the statement (one per day)' })
  @IsDateOnly()
  date: string;

  @ApiProperty({ example: 10542.37 })
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(999_999_999_999.99)
  value: number;
}

export class HistoryQueryDto {
  @ApiPropertyOptional({ example: 12, minimum: 2, maximum: 120, default: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(120)
  months: number = 12;

  @ApiPropertyOptional({ format: 'uuid', description: 'Only this investment (default: whole portfolio)' })
  @IsOptional()
  @IsUUID()
  investmentId?: string;
}

// ---------------- Responses ----------------

export class ValuationDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: '2026-09-30' })
  date: string;

  @ApiProperty({ example: '10542.37' })
  value: string;
}

export class InvestmentDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ type: AccountSummaryDto })
  account: AccountSummaryDto;

  @ApiProperty({ enum: InvestmentClass })
  assetClass: InvestmentClass;

  @ApiProperty({ enum: YieldMode })
  yieldMode: YieldMode;

  @ApiProperty({ example: '110.0000', nullable: true, type: String })
  rate: string | null;

  @ApiProperty({ example: '2026-03-10' })
  startDate: string;

  @ApiProperty({ example: null, nullable: true, type: String })
  maturityDate: string | null;

  @ApiProperty()
  archived: boolean;

  @ApiProperty({ example: '10542.37', description: 'Estimated gross value today (before income tax)' })
  value: string;

  @ApiProperty({ example: '10000.00', description: 'Net invested: contributions minus withdrawals' })
  invested: string;

  @ApiProperty({ example: '542.37' })
  profit: string;

  @ApiProperty({ example: 5.42, nullable: true, type: Number })
  profitPercent: number | null;

  @ApiProperty({ example: 104.3, nullable: true, type: Number, description: 'Profit relative to the same flows at 100% of the CDI' })
  percentOfCdi: number | null;

  @ApiProperty({ type: ValuationDto, nullable: true })
  lastValuation: ValuationDto | null;

  @ApiProperty({ description: 'A rate this investment needs was unavailable, so growth may be understated' })
  missingMarketData: boolean;
}

export class AllocationDto {
  @ApiProperty({ enum: InvestmentClass })
  assetClass: InvestmentClass;

  @ApiProperty({ example: '7500.00' })
  value: string;

  @ApiProperty({ example: 62.5 })
  percent: number;
}

export class MarketInfoDto {
  @ApiProperty({ example: '2026-09-30', nullable: true, type: String, description: 'Last CDI published by Banco Central' })
  cdiUpdatedAt: string | null;

  @ApiProperty({ example: 13.65, nullable: true, type: Number, description: 'Last CDI annualized (252 days), %' })
  cdiAnnual: number | null;

  @ApiProperty({ example: '2026-08', nullable: true, type: String })
  ipcaUpdatedAt: string | null;

  @ApiProperty({ example: 4.3, nullable: true, type: Number, description: 'IPCA accumulated over the last 12 published months, %' })
  ipca12m: number | null;
}

export class PortfolioSummaryDto {
  @ApiProperty({ example: '25000.00' })
  value: string;

  @ApiProperty({ example: '23000.00' })
  invested: string;

  @ApiProperty({ example: '2000.00' })
  profit: string;

  @ApiProperty({ example: 8.7, nullable: true, type: Number })
  profitPercent: number | null;

  @ApiProperty({ example: '24800.00', description: 'Same contributions and withdrawals at 100% of the CDI' })
  cdiValue: string;

  @ApiProperty({ example: '23900.00', description: 'Same contributions corrected by inflation (IPCA)' })
  ipcaValue: string;

  @ApiProperty({ example: 110.5, nullable: true, type: Number })
  percentOfCdi: number | null;

  @ApiProperty({ example: '180.00', description: 'Value change since the end of last month, minus net contributions' })
  monthProfit: string;
}

export class PortfolioDto {
  @ApiProperty({ type: PortfolioSummaryDto })
  summary: PortfolioSummaryDto;

  @ApiProperty({ type: [AllocationDto] })
  allocation: AllocationDto[];

  @ApiProperty({ type: [InvestmentDto] })
  items: InvestmentDto[];

  @ApiProperty({ type: MarketInfoDto })
  market: MarketInfoDto;
}

export class HistoryPointDto {
  @ApiProperty({ example: '2026-09-30', description: 'Month end (today for the current month)' })
  date: string;

  @ApiProperty({ example: '24000.00' })
  value: string;

  @ApiProperty({ example: '22500.00' })
  invested: string;

  @ApiProperty({ example: '23950.00' })
  cdiValue: string;

  @ApiProperty({ example: '22900.00' })
  ipcaValue: string;
}

export class InvestmentMovementDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: ['CONTRIBUTION', 'WITHDRAWAL', 'INCOME', 'FEE'] })
  kind: 'CONTRIBUTION' | 'WITHDRAWAL' | 'INCOME' | 'FEE';

  @ApiProperty({ example: '2026-09-10' })
  date: string;

  @ApiProperty({ example: '300.00' })
  amount: string;

  @ApiProperty({ example: 'Aporte mensal', nullable: true, type: String })
  description: string | null;

  @ApiProperty({ type: AccountSummaryDto, nullable: true, description: 'The other account of a transfer' })
  counterpart: AccountSummaryDto | null;
}

export class ScheduledContributionDto {
  @ApiProperty()
  ruleId: string;

  @ApiProperty({ example: 'Aporte mensal' })
  description: string;

  @ApiProperty({ example: '300.00' })
  amount: string;

  @ApiProperty({ example: 'MONTHLY' })
  frequency: string;

  @ApiProperty({ example: '2026-10-10', nullable: true, type: String })
  nextDate: string | null;

  @ApiProperty()
  active: boolean;

  @ApiProperty({ type: AccountSummaryDto })
  fromAccount: AccountSummaryDto;
}

export class InvestmentDetailDto extends InvestmentDto {
  @ApiProperty({ type: [ValuationDto] })
  valuations: ValuationDto[];

  @ApiProperty({ type: [InvestmentMovementDto], description: 'Last 100 movements, newest first' })
  movements: InvestmentMovementDto[];

  @ApiProperty({ type: [ScheduledContributionDto] })
  scheduled: ScheduledContributionDto[];
}
