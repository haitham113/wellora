import { ApiProperty } from '@nestjs/swagger';

import { PaginationMetaDto } from '../../../common/pagination/pagination-meta.dto.js';
import {
  MembershipStatus,
  OrganizationStatus,
  ProviderMembershipRole,
} from '../../../generated/prisma/enums.js';

export class ProviderResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'MoveWell Studios' })
  businessName!: string;

  @ApiProperty({ example: 'movewell-studios' })
  slug!: string;

  @ApiProperty({ nullable: true })
  description!: string | null;

  @ApiProperty({ enum: OrganizationStatus })
  status!: OrganizationStatus;

  @ApiProperty({ example: 'EG' })
  country!: string;

  @ApiProperty({ example: 'Africa/Cairo' })
  timezone!: string;

  @ApiProperty({ nullable: true })
  contactEmail!: string | null;

  @ApiProperty({ nullable: true })
  contactPhone!: string | null;

  @ApiProperty({ nullable: true })
  websiteUrl!: string | null;

  @ApiProperty({ example: 1250, description: 'Platform commission in basis points' })
  commissionRateBps!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class ProviderMemberResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ example: 'staff@movewell.example' })
  email!: string;

  @ApiProperty({ enum: ProviderMembershipRole })
  role!: ProviderMembershipRole;

  @ApiProperty({ enum: MembershipStatus })
  status!: MembershipStatus;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export class ProviderPageResponseDto {
  @ApiProperty({ type: ProviderResponseDto, isArray: true })
  data!: ProviderResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

export class ProviderMemberPageResponseDto {
  @ApiProperty({ type: ProviderMemberResponseDto, isArray: true })
  data!: ProviderMemberResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}
