import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { Matches } from 'class-validator';
import { IsSafeText } from '../../common/validation/decorators.js';
import { HouseholdRole } from '../../generated/prisma/client.js';

export class UpdateHouseholdDto {
  @ApiProperty({ example: 'Casa da Ana e do João', maxLength: 60 })
  @IsSafeText({ maxLength: 60 })
  name: string;
}

export class JoinHouseholdDto {
  @ApiProperty({ example: 'K7QM-4XPA', description: 'Invite code (dash and case are ignored)' })
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase().replace(/[\s-]/g, '') : value))
  @Matches(/^[A-Z0-9]{8}$/, { message: 'code must be an 8-character invite code' })
  code: string;
}

export class HouseholdMemberDto {
  @ApiProperty({ example: '6f1c2b8e-3a4d-4f6b-9c1e-2d3f4a5b6c7d' })
  userId: string;

  @ApiProperty({ example: 'Ana' })
  name: string;

  @ApiProperty({ example: 'ana@example.com' })
  email: string;

  @ApiProperty({ enum: HouseholdRole })
  role: HouseholdRole;

  @ApiProperty()
  joinedAt: Date;

  @ApiProperty({ description: 'Whether this member is the authenticated user' })
  isYou: boolean;
}

export class HouseholdResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' })
  id: string;

  @ApiProperty({ example: 'Casa da Ana' })
  name: string;

  @ApiProperty({ enum: HouseholdRole, description: "The authenticated user's role" })
  role: HouseholdRole;

  @ApiProperty({ type: [HouseholdMemberDto] })
  members: HouseholdMemberDto[];

  @ApiProperty({ description: 'False on the public demo household' })
  invitesEnabled: boolean;
}

export class InviteResponseDto {
  @ApiProperty({ example: 'K7QM-4XPA', description: 'Shown once; only its hash is stored' })
  code: string;

  @ApiProperty({ example: '2026-10-04T12:00:00.000Z' })
  expiresAt: Date;
}
