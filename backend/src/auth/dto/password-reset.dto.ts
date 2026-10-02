import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'maria@example.com' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(160)
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: 'Token from the e-mailed link (after #token=)' })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/, { message: 'Invalid or expired reset link' })
  token: string;

  @ApiProperty({ example: 'N0vaSenha!', minLength: 8, description: 'Same rules as registration' })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, { message: 'password must contain at least one letter and one number' })
  password: string;
}

export class AuthCapabilitiesDto {
  @ApiProperty({ description: 'False when e-mail is not configured (the "forgot password" link is hidden)' })
  passwordReset: boolean;
}

export class MessageDto {
  @ApiProperty({ example: 'If this e-mail is registered, a link is on its way.' })
  message: string;
}
