import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsPositive, Matches, Max, Min, NotEquals } from 'class-validator';
import { IsDateOnly, IsSafeText } from '../../common/validation/decorators.js';
import { UserRefDto } from '../../transactions/dto/transaction.dto.js';

export class CreateGoalDto {
  @ApiProperty({ example: 'Viagem para o Chile', maxLength: 60 })
  @IsSafeText({ maxLength: 60 })
  name: string;

  @ApiProperty({ example: 12000 })
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @IsPositive()
  @Max(999_999_999_999.99)
  targetAmount: number;

  @ApiPropertyOptional({ example: '2027-07-01' })
  @IsOptional()
  @IsDateOnly()
  targetDate?: string;

  @ApiPropertyOptional({ example: '#3b82f6' })
  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'color must be a hex color like #3b82f6' })
  color?: string;

  @ApiPropertyOptional({ example: 'plane' })
  @IsOptional()
  @Matches(/^[a-z0-9-]{1,40}$/, { message: 'icon must be a lowercase icon name' })
  icon?: string;
}

export class UpdateGoalDto extends PartialType(CreateGoalDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}

export class CreateContributionDto {
  @ApiProperty({ example: 600, description: 'Positive to save, negative to withdraw' })
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @NotEquals(0, { message: 'amount cannot be zero' })
  @Min(-999_999_999_999.99)
  @Max(999_999_999_999.99)
  amount: number;

  @ApiProperty({ example: '2026-10-05' })
  @IsDateOnly()
  date: string;

  @ApiPropertyOptional({ example: 'Sobrou do mês', maxLength: 120 })
  @IsOptional()
  @IsSafeText({ maxLength: 120, optional: true })
  note?: string;
}

export class ContributionResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: '600.00' })
  amount: string;

  @ApiProperty({ example: '2026-10-05' })
  date: string;

  @ApiProperty({ nullable: true, type: String })
  note: string | null;

  @ApiProperty({ type: UserRefDto, nullable: true })
  createdBy: UserRefDto | null;
}

export class GoalResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'Viagem para o Chile' })
  name: string;

  @ApiProperty({ example: '12000.00' })
  targetAmount: string;

  @ApiProperty({ example: '2027-07-01', nullable: true, type: String })
  targetDate: string | null;

  @ApiProperty({ nullable: true, type: String })
  color: string | null;

  @ApiProperty({ nullable: true, type: String })
  icon: string | null;

  @ApiProperty()
  archived: boolean;

  @ApiProperty({ example: '4800.00' })
  saved: string;

  @ApiProperty({ example: '7200.00' })
  remaining: string;

  @ApiProperty({ example: 40 })
  percent: number;

  @ApiProperty({ example: '800.00', nullable: true, type: String, description: 'Per month to finish on time' })
  monthlyNeeded: string | null;

  @ApiProperty({ example: '600.00', description: 'Average net contribution per month (last 90 days)' })
  monthlyPace: string;

  @ApiProperty({ example: '2027-10-01', nullable: true, type: String, description: 'When the current pace reaches the target' })
  projectedDate: string | null;

  @ApiProperty({ enum: ['COMPLETED', 'ON_TRACK', 'BEHIND', 'OVERDUE', 'NO_DEADLINE'] })
  status: string;

  @ApiProperty()
  createdAt: Date;
}

export class GoalDetailDto extends GoalResponseDto {
  @ApiProperty({ type: [ContributionResponseDto], description: 'Most recent first' })
  contributions: ContributionResponseDto[];
}
