import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsNumber, IsOptional, Matches, Max, Min } from 'class-validator';
import { IsSafeText } from '../../common/validation/decorators.js';
import { AccountType } from '../../generated/prisma/client.js';

export class CreateAccountDto {
  @ApiProperty({ example: 'Nubank', maxLength: 40 })
  @IsSafeText({ maxLength: 40 })
  name: string;

  @ApiProperty({ enum: AccountType, example: AccountType.CHECKING })
  @IsEnum(AccountType)
  type: AccountType;

  @ApiPropertyOptional({ example: '#8b5cf6' })
  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'color must be a hex color like #8b5cf6' })
  color?: string;

  @ApiPropertyOptional({ example: 'landmark' })
  @IsOptional()
  @Matches(/^[a-z0-9-]{1,40}$/, { message: 'icon must be a lowercase icon name' })
  icon?: string;

  @ApiPropertyOptional({
    example: 1500,
    default: 0,
    description: 'Balance when you started tracking. Can be negative (e.g. an open credit card bill).',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(-999_999_999_999.99)
  @Max(999_999_999_999.99)
  initialBalance?: number;
}

export class UpdateAccountDto extends PartialType(CreateAccountDto) {
  @ApiPropertyOptional({ description: 'Archived accounts keep their history but take no new entries' })
  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}

export class ListAccountsQueryDto {
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  // Not @Type(() => Boolean): Boolean("false") is true.
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeArchived?: boolean;
}

export class AccountSummaryDto {
  @ApiProperty({ example: '3d8f1a2b-9c4e-4b7a-8f6d-1e2c3b4a5d6e' })
  id: string;

  @ApiProperty({ example: 'Nubank' })
  name: string;

  @ApiProperty({ enum: AccountType })
  type: AccountType;

  @ApiProperty({ example: '#8b5cf6', nullable: true, type: String })
  color: string | null;

  @ApiProperty({ example: 'landmark', nullable: true, type: String })
  icon: string | null;
}

export class AccountResponseDto extends AccountSummaryDto {
  @ApiProperty({ example: '1500.00' })
  initialBalance: string;

  @ApiProperty({ example: '3420.75', description: 'Balance today: initial + income − expense ± transfers (dated up to today)' })
  balance: string;

  @ApiProperty({ example: '-890.00', description: 'Net of entries dated in the future (e.g. upcoming installments)' })
  upcoming: string;

  @ApiProperty()
  archived: boolean;

  @ApiProperty({ example: 42 })
  transactionCount: number;

  @ApiProperty()
  createdAt: Date;
}

export class AccountListDto {
  @ApiProperty({ type: [AccountResponseDto] })
  data: AccountResponseDto[];

  @ApiProperty({ example: '12890.40', description: 'Sum of the balances of active accounts' })
  totalBalance: string;
}
