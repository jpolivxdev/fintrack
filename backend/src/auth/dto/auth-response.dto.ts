import { ApiProperty } from '@nestjs/swagger';

export class UserResponseDto {
  @ApiProperty({ example: '6f1c2b8e-3a4d-4f6b-9c1e-2d3f4a5b6c7d' })
  id: string;

  @ApiProperty({ example: 'Maria Silva' })
  name: string;

  @ApiProperty({ example: 'maria@example.com' })
  email: string;

  @ApiProperty({ example: '2026-10-01T12:00:00.000Z' })
  createdAt: Date;
}

export class AuthResponseDto {
  @ApiProperty({
    description: 'Short-lived JWT (15 min). Send as `Authorization: Bearer <token>`',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken: string;

  @ApiProperty({
    description:
      'Long-lived JWT (7 days) used only on /auth/refresh. Single use: every refresh rotates it.',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  refreshToken: string;

  @ApiProperty({ type: UserResponseDto })
  user: UserResponseDto;
}
