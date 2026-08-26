import type { Prisma } from '../../generated/prisma/client.js';
import type {
  AvailabilitySessionResponseDto,
  ProviderSessionResponseDto,
  ScheduleTemplateResponseDto,
} from './dto/scheduling-response.dto.js';
import type { TimezoneService } from './timezone.service.js';

export const sessionSelect = {
  id: true,
  activityId: true,
  scheduleTemplateId: true,
  startsAt: true,
  endsAt: true,
  timezone: true,
  utcOffsetMinutes: true,
  capacity: true,
  bookedCount: true,
  bookingCutoffMinutes: true,
  bookingCutoffAt: true,
  status: true,
  cancellationReason: true,
  cancelledAt: true,
  cancelledByUserId: true,
  completedAt: true,
  version: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ActivitySessionSelect;

export const scheduleTemplateSelect = {
  id: true,
  activityId: true,
  timezone: true,
  localStartTime: true,
  weekdays: true,
  intervalWeeks: true,
  generationStartDate: true,
  generationEndDate: true,
  durationMinutes: true,
  capacity: true,
  bookingCutoffMinutes: true,
  dstOverlapPolicy: true,
  dstGapPolicy: true,
  lastGeneratedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ActivityScheduleTemplateSelect;

export type SessionRecord = Prisma.ActivitySessionGetPayload<{ select: typeof sessionSelect }>;
export type ScheduleTemplateRecord = Prisma.ActivityScheduleTemplateGetPayload<{
  select: typeof scheduleTemplateSelect;
}>;

export function mapAvailabilitySession(
  record: SessionRecord,
  timezone: TimezoneService,
): AvailabilitySessionResponseDto {
  return {
    id: record.id,
    activityId: record.activityId,
    startsAt: record.startsAt.toISOString(),
    endsAt: record.endsAt.toISOString(),
    timezone: record.timezone,
    localStartsAt: timezone.formatLocalDateTime(record.startsAt, record.timezone),
    localEndsAt: timezone.formatLocalDateTime(record.endsAt, record.timezone),
    utcOffsetMinutes: record.utcOffsetMinutes,
    capacity: record.capacity,
    remainingCapacity: record.capacity - record.bookedCount,
    bookingCutoffAt: record.bookingCutoffAt.toISOString(),
    status: record.status,
  };
}

export function mapProviderSession(
  record: SessionRecord,
  timezone: TimezoneService,
): ProviderSessionResponseDto {
  const availability = mapAvailabilitySession(record, timezone);
  return {
    id: availability.id,
    activityId: availability.activityId,
    startsAt: availability.startsAt,
    endsAt: availability.endsAt,
    timezone: availability.timezone,
    localStartsAt: availability.localStartsAt,
    localEndsAt: availability.localEndsAt,
    utcOffsetMinutes: availability.utcOffsetMinutes,
    capacity: availability.capacity,
    remainingCapacity: availability.remainingCapacity,
    bookingCutoffAt: availability.bookingCutoffAt,
    status: availability.status,
    scheduleTemplateId: record.scheduleTemplateId,
    bookedCount: record.bookedCount,
    bookingCutoffMinutes: record.bookingCutoffMinutes,
    cancellationReason: record.cancellationReason,
    cancelledAt: record.cancelledAt?.toISOString() ?? null,
    cancelledByUserId: record.cancelledByUserId,
    completedAt: record.completedAt?.toISOString() ?? null,
    version: record.version,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function mapScheduleTemplate(
  record: ScheduleTemplateRecord,
  timezone: TimezoneService,
): ScheduleTemplateResponseDto {
  return {
    id: record.id,
    activityId: record.activityId,
    timezone: record.timezone,
    localStartTime: record.localStartTime,
    weekdays: record.weekdays,
    intervalWeeks: record.intervalWeeks,
    generationStartDate: timezone.formatLocalDate(record.generationStartDate),
    generationEndDate: timezone.formatLocalDate(record.generationEndDate),
    durationMinutes: record.durationMinutes,
    capacity: record.capacity,
    bookingCutoffMinutes: record.bookingCutoffMinutes,
    dstOverlapPolicy: record.dstOverlapPolicy,
    dstGapPolicy: record.dstGapPolicy,
    lastGeneratedAt: record.lastGeneratedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
