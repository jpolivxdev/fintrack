import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PaginationQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1, example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20, example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}

export class PaginationMetaDto {
  @ApiProperty({ example: 57 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 3 })
  totalPages: number;
}

export interface Paginated<T> {
  data: T[];
  meta: PaginationMetaDto;
}

export function toSkipTake({ page, limit }: PaginationQueryDto) {
  return { skip: (page - 1) * limit, take: limit };
}

export function paginate<T>(
  data: T[],
  total: number,
  { page, limit }: PaginationQueryDto,
): Paginated<T> {
  return {
    data,
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
}
