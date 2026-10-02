import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CredentialsThrottle } from '../common/throttling/throttling.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { SecurityLogger } from '../common/logging/security-logger.js';
import { Public } from '../common/decorators/public.decorator.js';
import { AuthService } from './auth.service.js';
import { AuthResponseDto, UserResponseDto } from './dto/auth-response.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { AuthCapabilitiesDto, ForgotPasswordDto, MessageDto, ResetPasswordDto } from './dto/password-reset.dto.js';
import { PasswordResetService } from './password-reset.service.js';

@ApiTags('Auth')
@ApiTooManyRequestsResponse({
  description: 'Rate limit exceeded (login/register: 5 attempts per IP every 15 min)',
})
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly securityLogger: SecurityLogger,
    private readonly passwordReset: PasswordResetService,
  ) {}

  @Public()
  @Get('capabilities')
  @ApiOperation({ summary: 'Which optional account features are available' })
  @ApiOkResponse({ type: AuthCapabilitiesDto })
  capabilities(): AuthCapabilitiesDto {
    return { passwordReset: this.passwordReset.enabled };
  }

  @Public()
  @CredentialsThrottle()
  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Send a password reset link',
    description: 'Always the same answer, whether the e-mail exists or not. The link is valid for 30 minutes and works once.',
  })
  @ApiOkResponse({ type: MessageDto })
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<MessageDto> {
    await this.passwordReset.request(dto.email);
    return { message: 'If this e-mail is registered, a link is on its way.' };
  }

  @Public()
  @CredentialsThrottle()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set a new password with the e-mailed link (signs out every session)' })
  @ApiOkResponse({ type: MessageDto })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<MessageDto> {
    await this.passwordReset.reset(dto.token, dto.password);
    return { message: 'Password changed. Log in with the new password.' };
  }

  @Public()
  @CredentialsThrottle()
  @Post('register')
  @ApiOperation({
    summary: 'Create an account',
    description:
      'Creates the user with a set of default categories and returns a token pair.',
  })
  @ApiCreatedResponse({ type: AuthResponseDto })
  @ApiConflictResponse({ description: 'Email is already registered' })
  register(@Body() dto: RegisterDto): Promise<AuthResponseDto> {
    return this.authService.register(dto);
  }

  @Public()
  @CredentialsThrottle()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in with email and password' })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid email or password' })
  async login(@Body() dto: LoginDto, @Req() req: Request): Promise<AuthResponseDto> {
    try {
      return await this.authService.login(dto);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        this.securityLogger.loginFailed(req, dto.email);
      }
      throw error;
    }
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Exchange a refresh token for a new token pair',
    description:
      'The refresh token is rotated: the one sent is revoked and a new one is returned. Reusing a revoked token revokes all sessions of the user.',
  })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid, expired or reused refresh token' })
  refresh(@Body() dto: RefreshTokenDto): Promise<AuthResponseDto> {
    return this.authService.refresh(dto.refreshToken);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a refresh token (end the session)' })
  @ApiNoContentResponse({ description: 'Session ended' })
  logout(@Body() dto: RefreshTokenDto): Promise<void> {
    return this.authService.logout(dto.refreshToken);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the authenticated user' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  me(@CurrentUser('id') userId: string): Promise<UserResponseDto> {
    return this.authService.me(userId);
  }
}
