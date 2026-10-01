import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
  NotEquals,
  ValidateNested,
} from 'class-validator';
import { IsDateOnly, IsSafeText } from '../../common/validation/decorators.js';
import { TransactionType } from '../../generated/prisma/client.js';

export const MAX_IMPORT_ROWS = 500;

export class ExportTransactionsQueryDto {
  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsDateOnly()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsDateOnly()
  endDate?: string;

  @ApiPropertyOptional({ enum: TransactionType })
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  accountId?: string;
}

export class ImportRowDto {
  @ApiProperty({ example: '2026-09-15' })
  @IsDateOnly()
  date: string;

  @ApiProperty({ example: 'Supermercado Extra' })
  @IsSafeText({ maxLength: 120 })
  description: string;

  @ApiProperty({ example: -249.9, description: 'Signed: negative = expense, positive = income (unless `type` is given)' })
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @NotEquals(0)
  @Min(-999_999_999_999.99)
  @Max(999_999_999_999.99)
  amount: number;

  @ApiPropertyOptional({ enum: TransactionType, description: 'Overrides the sign of `amount`' })
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @ApiPropertyOptional({ example: 'Alimentação', description: 'Category name (case-insensitive); falls back to the default' })
  @IsOptional()
  @IsSafeText({ maxLength: 50, optional: true })
  category?: string;

  @ApiPropertyOptional({ example: '20260915001', description: 'Bank id (OFX FITID) used to skip re-imported entries' })
  @IsOptional()
  @Matches(/^[\w.:-]{1,100}$/, { message: 'externalId must be up to 100 letters, digits or . _ : -' })
  externalId?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsSafeText({ maxLength: 500, multiline: true, optional: true })
  notes?: string;
}

export class ImportTransactionsDto {
  @ApiProperty({ format: 'uuid', description: 'Account the statement belongs to' })
  @IsUUID()
  accountId: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'For expense rows without a matching category' })
  @IsOptional()
  @IsUUID()
  defaultExpenseCategoryId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'For income rows without a matching category' })
  @IsOptional()
  @IsUUID()
  defaultIncomeCategoryId?: string;

  @ApiProperty({ type: [ImportRowDto], maxItems: MAX_IMPORT_ROWS })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_IMPORT_ROWS)
  @ValidateNested({ each: true })
  @Type(() => ImportRowDto)
  rows: ImportRowDto[];
}

class ImportErrorDto {
  @ApiProperty({ example: 3, description: 'Index of the row in the request' })
  row: number;

  @ApiProperty({ example: 'No category for expense "Pets"' })
  message: string;
}

export class ImportResultDto {
  @ApiProperty({ example: 42 })
  created: number;

  @ApiProperty({ example: 5, description: 'Already present (same bank id, or same date, amount and description)' })
  skipped: number;

  @ApiProperty({ type: [ImportErrorDto] })
  errors: ImportErrorDto[];
}
