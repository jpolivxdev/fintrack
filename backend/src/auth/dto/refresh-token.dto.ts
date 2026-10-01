import { ApiProperty } from '@nestjs/swagger';
import { IsJWT, MaxLength } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({
    description: 'Refresh token received from /auth/login or /auth/refresh',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsJWT()
  @MaxLength(2048)
  refreshToken: string;
}
