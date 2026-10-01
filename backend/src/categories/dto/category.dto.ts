import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  PaginationMetaDto,
  PaginationQueryDto,
} from '../../common/dto/pagination.dto.js';
import { TransactionType } from '../../generated/prisma/client.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateCategoryDto {
  @ApiProperty({ example: 'Mercado', maxLength: 50 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: string;

  @ApiProperty({ enum: TransactionType, example: TransactionType.EXPENSE })
  @IsEnum(TransactionType)
  type: TransactionType;

  @ApiPropertyOptional({ example: '#ef4444', description: 'Hex color' })
  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'color must be a hex color like #ef4444' })
  color?: string;

  @ApiPropertyOptional({
    example: 'shopping-cart',
    description: 'Icon name (lucide-react)',
    maxLength: 40,
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  icon?: string;
}

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}

export class ListCategoriesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: TransactionType })
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;
}

/** Compact category embedded in transactions and budgets. */
export class CategorySummaryDto {
  @ApiProperty({ example: '3d8f1a2b-9c4e-4b7a-8f6d-1e2c3b4a5d6e' })
  id: string;

  @ApiProperty({ example: 'Alimentação' })
  name: string;

  @ApiProperty({ enum: TransactionType, example: TransactionType.EXPENSE })
  type: TransactionType;

  @ApiProperty({ example: '#ef4444', nullable: true, type: String })
  color: string | null;

  @ApiProperty({ example: 'utensils', nullable: true, type: String })
  icon: string | null;
}

export class CategoryResponseDto extends CategorySummaryDto {
  @ApiProperty({ example: 12, description: 'Number of transactions in this category' })
  transactionCount: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class PaginatedCategoriesDto {
  @ApiProperty({ type: [CategoryResponseDto] })
  data: CategoryResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}
