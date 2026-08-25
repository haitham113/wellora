import { ApiProperty } from '@nestjs/swagger';

import { PaginationMetaDto } from '../../../common/pagination/pagination-meta.dto.js';
import {
  EmployeeStatus,
  EmployerMembershipRole,
  MembershipStatus,
  OrganizationStatus,
} from '../../../generated/prisma/enums.js';

export class EmployerResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Northwind Health' })
  name!: string;

  @ApiProperty({ example: 'northwind-health' })
  slug!: string;

  @ApiProperty({ enum: OrganizationStatus })
  status!: OrganizationStatus;

  @ApiProperty({ example: 'EG' })
  country!: string;

  @ApiProperty({ example: 'Africa/Cairo' })
  timezone!: string;

  @ApiProperty({ example: 'EGP' })
  defaultCurrency!: string;

  @ApiProperty({ nullable: true, example: 'benefits@northwind.example' })
  contactEmail!: string | null;

  @ApiProperty({ nullable: true, example: '+2025550100' })
  contactPhone!: string | null;

  @ApiProperty({ nullable: true, example: 'https://northwind.example' })
  websiteUrl!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class EmployerSettingsResponseDto {
  @ApiProperty({ format: 'uuid' })
  employerId!: string;

  @ApiProperty({ example: 'Africa/Cairo' })
  timezone!: string;

  @ApiProperty({ example: 'EGP' })
  defaultCurrency!: string;

  @ApiProperty({ nullable: true })
  contactEmail!: string | null;

  @ApiProperty({ nullable: true })
  contactPhone!: string | null;

  @ApiProperty({ nullable: true })
  websiteUrl!: string | null;
}

export class EmployerAdminResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ example: 'admin@northwind.example' })
  email!: string;

  @ApiProperty({ enum: EmployerMembershipRole })
  role!: EmployerMembershipRole;

  @ApiProperty({ enum: MembershipStatus })
  status!: MembershipStatus;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export class EmployeeResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  employerId!: string;

  @ApiProperty({ format: 'uuid', nullable: true })
  userId!: string | null;

  @ApiProperty({ example: 'samira@example.com' })
  email!: string;

  @ApiProperty({ example: 'Samira' })
  firstName!: string;

  @ApiProperty({ example: 'Hassan' })
  lastName!: string;

  @ApiProperty({ nullable: true, example: 'EMP-1042' })
  employeeNumber!: string | null;

  @ApiProperty({ nullable: true, example: 'Engineering' })
  department!: string | null;

  @ApiProperty({ nullable: true, example: 'Backend Engineer' })
  jobTitle!: string | null;

  @ApiProperty({ enum: EmployeeStatus })
  status!: EmployeeStatus;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class EmployerPageResponseDto {
  @ApiProperty({ type: EmployerResponseDto, isArray: true })
  data!: EmployerResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

export class EmployeePageResponseDto {
  @ApiProperty({ type: EmployeeResponseDto, isArray: true })
  data!: EmployeeResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

export class EmployerAdminPageResponseDto {
  @ApiProperty({ type: EmployerAdminResponseDto, isArray: true })
  data!: EmployerAdminResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}
