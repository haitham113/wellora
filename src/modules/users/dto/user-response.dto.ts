import { ApiProperty } from '@nestjs/swagger';

import { AccountStatus, PlatformRole } from '../../../generated/prisma/enums.js';

export class UserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'alex@example.com' })
  email!: string;

  @ApiProperty({ enum: AccountStatus })
  status!: AccountStatus;

  @ApiProperty({ enum: PlatformRole, nullable: true })
  platformRole!: PlatformRole | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  emailVerifiedAt!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}
