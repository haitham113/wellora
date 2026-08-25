import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const containsNonWhitespace = /\S/u;

export class LoginDto {
  @ApiProperty({ example: 'alex@example.com', format: 'email' })
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @ApiProperty({ format: 'password', minLength: 1, maxLength: 128, writeOnly: true })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;

  @ApiPropertyOptional({ example: 'Work laptop', maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  deviceName?: string;
}

export class RefreshDto {
  @ApiProperty({ description: 'Opaque rotating refresh token', writeOnly: true })
  @IsString()
  @MinLength(40)
  @MaxLength(160)
  refreshToken!: string;
}

export class ChangePasswordDto {
  @ApiProperty({ format: 'password', maxLength: 128, writeOnly: true })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  currentPassword!: string;

  @ApiProperty({ format: 'password', minLength: 12, maxLength: 128, writeOnly: true })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  @Matches(containsNonWhitespace, {
    message: 'newPassword must contain a non-whitespace character',
  })
  newPassword!: string;
}

export class EmailRequestDto {
  @ApiProperty({ example: 'alex@example.com', format: 'email' })
  @IsEmail()
  @MaxLength(320)
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: 'Single-use password reset token', writeOnly: true })
  @IsString()
  @MinLength(40)
  @MaxLength(160)
  token!: string;

  @ApiProperty({ format: 'password', minLength: 12, maxLength: 128, writeOnly: true })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  @Matches(containsNonWhitespace, {
    message: 'newPassword must contain a non-whitespace character',
  })
  newPassword!: string;
}

export class VerifyEmailDto {
  @ApiProperty({ description: 'Single-use email verification token', writeOnly: true })
  @IsString()
  @MinLength(40)
  @MaxLength(160)
  token!: string;
}
