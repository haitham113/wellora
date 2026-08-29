import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsISO4217CurrencyCode,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

import { PageQueryDto } from '../../../common/pagination/page-query.dto.js';
import { EmployeeStatus, OrganizationStatus } from '../../../generated/prisma/enums.js';

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const countryPattern = /^[A-Z]{2}$/;
const currencyPattern = /^[A-Z]{3}$/;

export class CreateEmployerDto {
  @ApiProperty({ example: 'Northwind Health', maxLength: 160 })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @ApiProperty({ example: 'northwind-health', pattern: slugPattern.source })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  @Matches(slugPattern)
  slug!: string;

  @ApiProperty({ example: 'EG', minLength: 2, maxLength: 2 })
  @Matches(countryPattern)
  country!: string;

  @ApiProperty({ example: 'Africa/Cairo', description: 'IANA timezone' })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  timezone!: string;

  @ApiProperty({ example: 'EGP', minLength: 3, maxLength: 3 })
  @Matches(currencyPattern)
  @IsISO4217CurrencyCode()
  defaultCurrency!: string;

  @ApiPropertyOptional({ example: 'benefits@northwind.example', format: 'email' })
  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  contactEmail?: string;

  @ApiPropertyOptional({ example: '+2025550100' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  contactPhone?: string;

  @ApiPropertyOptional({ example: 'https://northwind.example', format: 'uri' })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(2048)
  websiteUrl?: string;

  @ApiProperty({ format: 'uuid', description: 'Existing active user assigned atomically' })
  @IsUUID('4')
  initialAdminUserId!: string;
}

export class AdminUpdateEmployerDto extends PartialType(
  OmitType(CreateEmployerDto, ['initialAdminUserId'] as const),
) {}

export class TenantUpdateEmployerDto {
  @ApiPropertyOptional({ example: 'Northwind Health' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional({ example: 'northwind-health', pattern: slugPattern.source })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  @Matches(slugPattern)
  slug?: string;

  @ApiPropertyOptional({ example: 'EG' })
  @IsOptional()
  @Matches(countryPattern)
  country?: string;
}

export class UpdateEmployerSettingsDto {
  @ApiPropertyOptional({ example: 'Africa/Cairo', description: 'IANA timezone' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  timezone?: string;

  @ApiPropertyOptional({ example: 'EGP' })
  @IsOptional()
  @Matches(currencyPattern)
  @IsISO4217CurrencyCode()
  defaultCurrency?: string;

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
}

export class EmployerListQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ example: 'northwind' })
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

export class AddEmployerAdminDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'Existing membership in this employer, or an active global account when called by a platform admin',
  })
  @IsUUID('4')
  userId!: string;
}

export class EmployerAdminListQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ example: 'admin@example.com' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}

export class CreateEmployeeDto {
  @ApiProperty({ example: 'samira@example.com', format: 'email' })
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @ApiProperty({ example: 'Samira' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName!: string;

  @ApiProperty({ example: 'Hassan' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName!: string;

  @ApiPropertyOptional({ example: 'EMP-1042' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  employeeNumber?: string;

  @ApiPropertyOptional({ example: 'Engineering' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  department?: string;

  @ApiPropertyOptional({ example: 'Backend Engineer' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  jobTitle?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Existing account to link; direct global-account linking requires platform-admin authority',
  })
  @IsOptional()
  @IsUUID('4')
  userId?: string;
}

export class UpdateEmployeeDto extends PartialType(
  OmitType(CreateEmployeeDto, ['userId'] as const),
) {}

export class EmployeeListQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ example: 'samira' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ enum: EmployeeStatus })
  @IsOptional()
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;

  @ApiPropertyOptional({ example: 'Engineering' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  department?: string;
}
