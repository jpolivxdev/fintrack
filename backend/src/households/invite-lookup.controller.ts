import { Body, Controller, HttpCode, HttpStatus, NotFoundException, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { CredentialsThrottle } from '../common/throttling/throttling.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { JoinHouseholdDto } from './dto/household.dto.js';
import { hashInviteCode } from './households.service.js';

export class InviteLookupDto {
  @ApiProperty({ enum: ['CALENDAR', 'HOUSEHOLD'], description: 'Calendar only, or calendar + finances' })
  kind: 'CALENDAR' | 'HOUSEHOLD';

  @ApiProperty({ example: 'João', description: "First name of who created the code" })
  inviterName: string;
}

/**
 * One "share with someone" screen accepts both kinds of code: this tells the
 * app which one it is (and who sent it) before anything happens, so the user
 * confirms knowing whether finances will be joined. The code is not consumed.
 */
@ApiTags('Calendar sharing')
@ApiBearerAuth()
@Controller('invites')
export class InviteLookupController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('lookup')
  @CredentialsThrottle()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Identify an invite code without using it' })
  @ApiOkResponse({ type: InviteLookupDto })
  @ApiNotFoundResponse({ description: 'Invalid or expired invite code' })
  @ApiTooManyRequestsResponse({ description: 'Too many attempts (5 per 15 min)' })
  async lookup(@Body() dto: JoinHouseholdDto): Promise<InviteLookupDto> {
    const codeHash = hashInviteCode(dto.code);
    const now = new Date();
    const [calendar, household] = await Promise.all([
      this.prisma.calendarInvite.findUnique({ where: { codeHash }, include: { createdBy: { select: { name: true } } } }),
      this.prisma.householdInvite.findUnique({ where: { codeHash }, include: { createdBy: { select: { name: true } } } }),
    ]);
    const valid = (i: { usedAt: Date | null; expiresAt: Date } | null) => !!i && !i.usedAt && i.expiresAt > now;
    const firstName = (name: string) => name.split(' ')[0];
    if (valid(calendar)) return { kind: 'CALENDAR', inviterName: firstName(calendar!.createdBy.name) };
    if (valid(household)) return { kind: 'HOUSEHOLD', inviterName: firstName(household!.createdBy.name) };
    // Same answer for unknown, used and expired codes.
    throw new NotFoundException('Invalid or expired invite code');
  }
}
