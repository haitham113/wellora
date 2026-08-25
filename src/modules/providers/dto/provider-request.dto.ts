import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { PageQueryDto } from '../../../common/pagination/page-query.dto.js';
import {
  MembershipStatus,
  OrganizationStatus,
  ProviderMembershipRole,
} from '../../../generated/prisma/enums.js';

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const countryPattern = /^[A-Z]{2}$/;

export class CreateProviderDto {
  @ApiProperty({ example: 'MoveWell Studios' })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  businessName!: string;

  @ApiProperty({ example: 'movewell-studios', pattern: slugPattern.source })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  @Matches(slugPattern)
  slug!: string;

  @ApiPropertyOptional({ maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiProperty({ example: 'EG' })
  @Matches(countryPattern)
  country!: string;

  @ApiProperty({ example: 'Africa/Cairo', description: 'IANA timezone' })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  timezone!: string;

  @ApiPropertyOptional({ format: 'email' })
  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  contactEmail?: string;

  @ApiPropertyOptional({ example: '+2025550100' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  contactPhone?: string;

  @ApiPropertyOptional({ format: 'uri' })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(2048)
  websiteUrl?: string;

  @ApiProperty({ example: 1250, minimum: 0, maximum: 10_000 })
  @IsInt()
  @Min(0)
  @Max(10_000)
  commissionRateBps!: number;

  @ApiProperty({ format: 'uuid', description: 'Existing active user assigned atomically' })
  @IsUUID('4')
  initialAdminUserId!: string;
}

export class AdminUpdateProviderDto extends PartialType(
  OmitType(CreateProviderDto, ['initialAdminUserId'] as const),
) {}

export class TenantUpdateProviderDto extends PartialType(
  OmitType(CreateProviderDto, ['initialAdminUserId', 'commissionRateBps'] as const),
) {}

export class ProviderListQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ example: 'movewell' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ enum: OrganizationStatus })
  @IsOptional()
  @IsEnum(OrganizationStatus)
  status?: OrganizationStatus;

  @ApiPropertyOptional({ example: 'EG' })
  @IsOptional()
  @Matches(countryPattern)
  country?: string;
}

export class AddProviderMemberDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'Existing membership in this provider, or an active global account when called by a platform admin',
  })
  @IsUUID('4')
  userId!: string;

  @ApiProperty({ enum: ProviderMembershipRole })
  @IsEnum(ProviderMembershipRole)
  role!: ProviderMembershipRole;
}

export class UpdateProviderMemberDto {
  @ApiProperty({ enum: ProviderMembershipRole })
  @IsEnum(ProviderMembershipRole)
  role!: ProviderMembershipRole;
}

export class ProviderMemberListQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ example: 'staff@example.com' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ enum: ProviderMembershipRole })
  @IsOptional()
  @IsEnum(ProviderMembershipRole)
  role?: ProviderMembershipRole;

  @ApiPropertyOptional({ enum: MembershipStatus })
  @IsOptional()
  @IsEnum(MembershipStatus)
  status?: MembershipStatus;
}
