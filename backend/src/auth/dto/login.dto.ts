import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'demo@fintrack.dev' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(160)
  email: string;

  @ApiProperty({ example: 'Demo@1234' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128) // caps the bcrypt work an attacker can trigger per request
  password: string;
}
