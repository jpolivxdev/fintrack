import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsSafeText } from '../../common/validation/decorators.js';
import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'Maria Silva', maxLength: 80 })
  @IsSafeText({ maxLength: 80 })
  name: string;

  @ApiProperty({ example: 'maria@example.com' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(160)
  email: string;

  @ApiProperty({
    example: 'Str0ngPass!',
    minLength: 8,
    description: 'At least 8 characters, with at least one letter and one number',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(72) // bcrypt only uses the first 72 bytes
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: 'password must contain at least one letter and one number',
  })
  password: string;
}
