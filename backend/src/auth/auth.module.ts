import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { PasswordResetService } from './password-reset.service.js';
import { MAILER, mailerFactory } from '../mail/mailer.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';

@Module({
  // Secrets are passed per call (access vs refresh use different keys).
  imports: [PassportModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, PasswordResetService, { provide: MAILER, inject: [ConfigService], useFactory: mailerFactory }],
})
export class AuthModule {}
