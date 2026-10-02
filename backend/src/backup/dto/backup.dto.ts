import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  Equals,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsDateOnly, IsInstant, IsSafeText } from '../../common/validation/decorators.js';
import {
  AccountType,
  EventVisibility,
  InvestmentClass,
  RecurrenceFrequency,
  TransactionType,
  YieldMode,
} from '../../generated/prisma/client.js';

/** References inside the file (the exporting database's ids); never trusted as ids here. */
const REF = /^[\w-]{1,64}$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;
const ICON = /^[a-z0-9-]{1,40}$/;
const MONEY = { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false } as const;
const MAX_MONEY = 999_999_999_999.99;

class Ref {
  @ApiProperty() @Matches(REF) ref: string;
}

export class BackupAccountDto extends Ref {
  @IsSafeText({ maxLength: 40 }) name: string;
  @IsEnum(AccountType) type: AccountType;
  @IsOptional() @Matches(COLOR) color?: string | null;
  @IsOptional() @Matches(ICON) icon?: string | null;
  @IsNumber(MONEY) @Min(-MAX_MONEY) @Max(MAX_MONEY) initialBalance: number;
  @IsBoolean() archived: boolean;
}

export class BackupCategoryDto extends Ref {
  @IsSafeText({ maxLength: 50 }) name: string;
  @IsEnum(TransactionType) type: TransactionType;
  @IsOptional() @Matches(COLOR) color?: string | null;
  @IsOptional() @Matches(ICON) icon?: string | null;
}

export class BackupTransactionDto {
  @Matches(REF) accountRef: string;
  @Matches(REF) categoryRef: string;
  @IsEnum(TransactionType) type: TransactionType;
  @IsSafeText({ maxLength: 120 }) description: string;
  @IsNumber(MONEY) @IsPositive() @Max(MAX_MONEY) amount: number;
  @IsDateOnly() date: string;
  @IsOptional() @IsSafeText({ maxLength: 500, multiline: true, optional: true }) notes?: string | null;
  @IsOptional() @Matches(REF) installmentGroupRef?: string | null;
  @IsOptional() @IsInt() @Min(1) @Max(420) installmentNumber?: number | null;
  @IsOptional() @IsInt() @Min(2) @Max(420) installmentTotal?: number | null;
  @IsOptional() @Matches(REF) recurringRef?: string | null;
  @IsOptional() @Matches(/^[\w.:-]{1,100}$/) externalId?: string | null;
}

export class BackupTransferDto {
  @Matches(REF) fromAccountRef: string;
  @Matches(REF) toAccountRef: string;
  @IsNumber(MONEY) @IsPositive() @Max(MAX_MONEY) amount: number;
  @IsDateOnly() date: string;
  @IsOptional() @IsSafeText({ maxLength: 120, optional: true }) description?: string | null;
  @IsOptional() @Matches(REF) recurringRef?: string | null;
}

export class BackupRecurringDto extends Ref {
  @IsSafeText({ maxLength: 120 }) description: string;
  @IsNumber(MONEY) @IsPositive() @Max(MAX_MONEY) amount: number;
  @IsEnum(TransactionType) type: TransactionType;
  @IsEnum(RecurrenceFrequency) frequency: RecurrenceFrequency;
  @IsOptional() @Matches(REF) categoryRef?: string | null;
  @Matches(REF) accountRef: string;
  @IsOptional() @Matches(REF) toAccountRef?: string | null;
  @IsOptional() @IsSafeText({ maxLength: 500, multiline: true, optional: true }) notes?: string | null;
  @IsDateOnly() startDate: string;
  @IsOptional() @IsDateOnly() endDate?: string | null;
  @IsDateOnly() nextRunDate: string;
  @IsBoolean() active: boolean;
}

export class BackupBudgetDto {
  @Matches(REF) categoryRef: string;
  @IsInt() @Min(2000) @Max(2100) year: number;
  @IsInt() @Min(1) @Max(12) month: number;
  @IsNumber(MONEY) @IsPositive() @Max(MAX_MONEY) monthlyLimit: number;
}

export class BackupContributionDto {
  @IsNumber(MONEY) @Min(-MAX_MONEY) @Max(MAX_MONEY) amount: number;
  @IsDateOnly() date: string;
  @IsOptional() @IsSafeText({ maxLength: 120, optional: true }) note?: string | null;
}

export class BackupGoalDto {
  @IsSafeText({ maxLength: 60 }) name: string;
  @IsNumber(MONEY) @IsPositive() @Max(MAX_MONEY) targetAmount: number;
  @IsOptional() @IsDateOnly() targetDate?: string | null;
  @IsOptional() @Matches(COLOR) color?: string | null;
  @IsOptional() @Matches(ICON) icon?: string | null;
  @IsBoolean() archived: boolean;
  @IsArray() @ArrayMaxSize(5000) @ValidateNested({ each: true }) @Type(() => BackupContributionDto) contributions: BackupContributionDto[];
}

export class BackupValuationDto {
  @IsDateOnly() date: string;
  @IsNumber(MONEY) @Min(0) @Max(MAX_MONEY) value: number;
}

export class BackupInvestmentDto {
  @Matches(REF) accountRef: string;
  @IsEnum(InvestmentClass) assetClass: InvestmentClass;
  @IsEnum(YieldMode) yieldMode: YieldMode;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4, allowNaN: false, allowInfinity: false }) @Min(-50) @Max(300) rate?: number | null;
  @IsDateOnly() startDate: string;
  @IsOptional() @IsDateOnly() maturityDate?: string | null;
  @IsArray() @ArrayMaxSize(5000) @ValidateNested({ each: true }) @Type(() => BackupValuationDto) valuations: BackupValuationDto[];
}

export class BackupEventDto {
  @IsSafeText({ maxLength: 120 }) title: string;
  @IsOptional() @IsSafeText({ maxLength: 1000, multiline: true, optional: true }) description?: string | null;
  @IsOptional() @IsSafeText({ maxLength: 160, optional: true }) location?: string | null;
  @IsInstant() startAt: string;
  @IsInstant() endAt: string;
  @IsBoolean() allDay: boolean;
  @IsEnum(EventVisibility) visibility: EventVisibility;
  @IsOptional() @Matches(COLOR) color?: string | null;
  @IsOptional() @IsNumber(MONEY) @Min(0) @Max(MAX_MONEY) estimatedCost?: number | null;
}

/** The whole household in one file: what "Baixar backup completo" produces. */
export class BackupFileDto {
  @ApiProperty({ example: 'fintrack-backup' }) @Equals('fintrack-backup') kind: 'fintrack-backup';
  @ApiProperty({ example: 1 }) @Equals(1) version: 1;
  @ApiProperty() @IsInstant() exportedAt: string;
  @ApiPropertyOptional() @IsOptional() @IsSafeText({ maxLength: 80, optional: true }) exportedBy?: string;

  @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => BackupAccountDto) accounts: BackupAccountDto[];
  @IsArray() @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => BackupCategoryDto) categories: BackupCategoryDto[];
  @IsArray() @ArrayMaxSize(50_000) @ValidateNested({ each: true }) @Type(() => BackupTransactionDto) transactions: BackupTransactionDto[];
  @IsArray() @ArrayMaxSize(20_000) @ValidateNested({ each: true }) @Type(() => BackupTransferDto) transfers: BackupTransferDto[];
  @IsArray() @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => BackupRecurringDto) recurring: BackupRecurringDto[];
  @IsArray() @ArrayMaxSize(5000) @ValidateNested({ each: true }) @Type(() => BackupBudgetDto) budgets: BackupBudgetDto[];
  @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => BackupGoalDto) goals: BackupGoalDto[];
  @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => BackupInvestmentDto) investments: BackupInvestmentDto[];
  @IsArray() @ArrayMaxSize(10_000) @ValidateNested({ each: true }) @Type(() => BackupEventDto) events: BackupEventDto[];
}

export class RestoreResultDto {
  @ApiProperty() accounts: number;
  @ApiProperty() categories: number;
  @ApiProperty() transactions: number;
  @ApiProperty() transfers: number;
  @ApiProperty() recurring: number;
  @ApiProperty() budgets: number;
  @ApiProperty() goals: number;
  @ApiProperty() investments: number;
  @ApiProperty() events: number;
}
