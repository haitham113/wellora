import { ApiProperty } from '@nestjs/swagger';

import { AccountStatus, PlatformRole } from '../../../generated/prisma/enums.js';

export class AuthenticatedUserDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'alex@example.com' })
  email!: string;

  @ApiProperty({ enum: AccountStatus })
  status!: AccountStatus;

  @ApiProperty({ enum: PlatformRole, nullable: true })
  platformRole!: PlatformRole | null;
}

export class TokenPairResponseDto {
  @ApiProperty({ description: 'Short-lived JWT bearer token' })
  accessToken!: string;

  @ApiProperty({ description: 'Opaque, single-use rotating refresh token' })
  refreshToken!: string;

  @ApiProperty({ example: 'Bearer' })
  tokenType!: 'Bearer';

  @ApiProperty({ example: 900 })
  expiresInSeconds!: number;

  @ApiProperty({ type: AuthenticatedUserDto })
  user!: AuthenticatedUserDto;
}

export class AuthSessionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, nullable: true, example: 'Work laptop' })
  deviceName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  userAgent!: string | null;

  @ApiProperty({ format: 'date-time' })
  lastSeenAt!: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty()
  current!: boolean;
}

export class AcceptedResponseDto {
  @ApiProperty({ example: true })
  accepted!: true;
}
