import { ApiProperty } from '@nestjs/swagger';

import { CatalogPaginationMetaDto } from '../../../common/pagination/catalog-pagination.dto.js';
import {
  ActivitySessionStatus,
  DstGapPolicy,
  DstOverlapPolicy,
} from '../../../generated/prisma/enums.js';

export class AvailabilitySessionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  activityId!: string;

  @ApiProperty({ format: 'date-time', description: 'UTC instant' })
  startsAt!: string;

  @ApiProperty({ format: 'date-time', description: 'UTC instant' })
  endsAt!: string;

  @ApiProperty({ example: 'Europe/London', description: 'IANA timezone snapshot' })
  timezone!: string;

  @ApiProperty({ example: '2026-10-25T09:30' })
  localStartsAt!: string;

  @ApiProperty({ example: '2026-10-25T10:30' })
  localEndsAt!: string;

  @ApiProperty({ example: 0, description: 'Selected offset from UTC at session start' })
  utcOffsetMinutes!: number;

  @ApiProperty({ example: 12 })
  capacity!: number;

  @ApiProperty({ example: 10 })
  remainingCapacity!: number;

  @ApiProperty({ format: 'date-time' })
  bookingCutoffAt!: string;

  @ApiProperty({ enum: ActivitySessionStatus })
  status!: ActivitySessionStatus;
}

export class ProviderSessionResponseDto extends AvailabilitySessionResponseDto {
  @ApiProperty({ nullable: true, format: 'uuid' })
  scheduleTemplateId!: string | null;

  @ApiProperty({ example: 2 })
  bookedCount!: number;

  @ApiProperty({ example: 120 })
  bookingCutoffMinutes!: number;

  @ApiProperty({ nullable: true })
  cancellationReason!: string | null;

  @ApiProperty({ nullable: true, format: 'date-time' })
  cancelledAt!: string | null;

  @ApiProperty({ nullable: true, format: 'uuid' })
  cancelledByUserId!: string | null;

  @ApiProperty({ nullable: true, format: 'date-time' })
  completedAt!: string | null;

  @ApiProperty({ description: 'Optimistic version prepared for transactional booking updates' })
  version!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class SessionPageResponseDto {
  @ApiProperty({ type: AvailabilitySessionResponseDto, isArray: true })
  data!: AvailabilitySessionResponseDto[];

  @ApiProperty({ type: CatalogPaginationMetaDto })
  meta!: CatalogPaginationMetaDto;
}

export class ProviderSessionPageResponseDto {
  @ApiProperty({ type: ProviderSessionResponseDto, isArray: true })
  data!: ProviderSessionResponseDto[];

  @ApiProperty({ type: CatalogPaginationMetaDto })
  meta!: CatalogPaginationMetaDto;
}

export class ScheduleTemplateResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  activityId!: string;

  @ApiProperty({ example: 'Europe/London' })
  timezone!: string;

  @ApiProperty({ example: '09:30' })
  localStartTime!: string;

  @ApiProperty({ type: Number, isArray: true, example: [1, 3, 5] })
  weekdays!: number[];

  @ApiProperty({ example: 1 })
  intervalWeeks!: number;

  @ApiProperty({ format: 'date', example: '2026-10-01' })
  generationStartDate!: string;

  @ApiProperty({ format: 'date', example: '2026-12-31' })
  generationEndDate!: string;

  @ApiProperty({ example: 60 })
  durationMinutes!: number;

  @ApiProperty({ example: 12 })
  capacity!: number;

  @ApiProperty({ example: 120 })
  bookingCutoffMinutes!: number;

  @ApiProperty({ enum: DstOverlapPolicy })
  dstOverlapPolicy!: DstOverlapPolicy;

  @ApiProperty({ enum: DstGapPolicy })
  dstGapPolicy!: DstGapPolicy;

  @ApiProperty({ nullable: true, format: 'date-time' })
  lastGeneratedAt!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class ScheduleGenerationResponseDto {
  @ApiProperty({ type: ScheduleTemplateResponseDto })
  schedule!: ScheduleTemplateResponseDto;

  @ApiProperty({ example: 12, description: 'New sessions inserted during this idempotent run' })
  generatedCount!: number;

  @ApiProperty({ example: 1, description: 'Nonexistent DST-gap occurrences explicitly skipped' })
  skippedGapCount!: number;
}
