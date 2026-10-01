import { ApiProperty, ApiPropertyOptional, PickType, PartialType } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsPositive, IsUUID, Max } from 'class-validator';
import { PaginationMetaDto, PaginationQueryDto } from '../../common/dto/pagination.dto.js';
import { IsDateOnly, IsSafeText } from '../../common/validation/decorators.js';
import { UserRefDto } from '../../transactions/dto/transaction.dto.js';
import { AccountSummaryDto } from './account.dto.js';

export class CreateTransferDto {
  @ApiProperty({ format: 'uuid', description: 'Account the money leaves' })
  @IsUUID()
  fromAccountId: string;

  @ApiProperty({ format: 'uuid', description: 'Account the money goes to' })
  @IsUUID()
  toAccountId: string;

  @ApiProperty({ example: 1250.4 })
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @IsPositive()
  @Max(999_999_999_999.99)
  amount: number;

  @ApiProperty({ example: '2026-10-05' })
  @IsDateOnly()
  date: string;

  @ApiPropertyOptional({ example: 'Pagamento da fatura', maxLength: 120 })
  @IsOptional()
  @IsSafeText({ maxLength: 120, optional: true })
  description?: string;
}

export class UpdateTransferDto extends PartialType(PickType(CreateTransferDto, ['amount', 'date', 'description'])) {}

export class ListTransfersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Transfers in or out of this account' })
  @IsOptional()
  @IsUUID()
  accountId?: string;

  @ApiPropertyOptional({ example: '2026-10-01' })
  @IsOptional()
  @IsDateOnly()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-10-31' })
  @IsOptional()
  @IsDateOnly()
  endDate?: string;
}

export class TransferResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: '1250.40' })
  amount: string;

  @ApiProperty({ example: '2026-10-05' })
  date: string;

  @ApiProperty({ example: 'Pagamento da fatura', nullable: true, type: String })
  description: string | null;

  @ApiProperty({ type: AccountSummaryDto })
  fromAccount: AccountSummaryDto;

  @ApiProperty({ type: AccountSummaryDto })
  toAccount: AccountSummaryDto;

  @ApiProperty({ type: UserRefDto, nullable: true })
  createdBy: UserRefDto | null;

  @ApiProperty()
  createdAt: Date;
}

export class PaginatedTransfersDto {
  @ApiProperty({ type: [TransferResponseDto] })
  data: TransferResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}
