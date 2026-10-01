import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class IncludeArchivedQueryDto {
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  // Not @Type(() => Boolean): Boolean("false") is true.
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeArchived?: boolean;
}
