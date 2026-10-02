import { Body, Controller, Get, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator.js';
import { CredentialsThrottle } from '../common/throttling/throttling.js';
import { BackupService } from './backup.service.js';
import { BackupFileDto, RestoreResultDto } from './dto/backup.dto.js';

@ApiTags('Backup')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@Controller('backup')
export class BackupController {
  constructor(private readonly backup: BackupService) {}

  @Get()
  @ApiOperation({ summary: 'Download a full backup of your household (JSON)' })
  @ApiOkResponse({ type: BackupFileDto })
  async export(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response): Promise<BackupFileDto> {
    const file = await this.backup.export(user);
    res.setHeader('Content-Disposition', `attachment; filename="fintrack-backup-${file.exportedAt.slice(0, 10)}.json"`);
    res.setHeader('Cache-Control', 'no-store');
    return file;
  }

  @Post('restore')
  @CredentialsThrottle()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Restore a backup into your household',
    description: 'Adds everything in the file (new ids; same-name categories are reused). All or nothing. Up to 15 MB.',
  })
  @ApiOkResponse({ type: RestoreResultDto })
  @ApiBadRequestResponse({ description: 'Invalid or inconsistent backup file' })
  @ApiForbiddenResponse({ description: 'The public demo account' })
  @ApiTooManyRequestsResponse({ description: 'Too many attempts (5 per 15 min)' })
  restore(@CurrentUser() user: AuthUser, @Body() file: BackupFileDto): Promise<RestoreResultDto> {
    return this.backup.restore(user, file);
  }
}
