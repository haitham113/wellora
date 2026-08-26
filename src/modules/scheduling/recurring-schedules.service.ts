import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';

import type { AuthPrincipal } from '../../common/auth/auth-principal.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { ActivityStatus, ProviderMembershipRole } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { activityNotFound, invalidActivityOperation } from '../activities/activity-errors.js';
import { ProviderAuthorizationPolicy } from '../providers/provider-authorization.policy.js';
import type {
  CreateScheduleTemplateDto,
  GenerateScheduleDto,
} from './dto/scheduling-request.dto.js';
import type {
  ScheduleGenerationResponseDto,
  ScheduleTemplateResponseDto,
} from './dto/scheduling-response.dto.js';
import { mapScheduleTemplate, scheduleTemplateSelect } from './scheduling.mapper.js';
import { invalidSchedule, scheduleNotFound } from './scheduling-errors.js';
import { SessionLifecyclePolicy } from './session-lifecycle.policy.js';
import { addMinutes, subtractMinutes } from './scheduling-time.js';
import { TimezoneService } from './timezone.service.js';

const scheduleManagerRoles = [ProviderMembershipRole.ADMIN, ProviderMembershipRole.STAFF] as const;

const scheduleActivitySelect = {
  id: true,
  status: true,
  durationMinutes: true,
  bookingCutoffMinutes: true,
  maxParticipants: true,
  provider: { select: { timezone: true } },
} as const;

@Injectable()
export class RecurringSchedulesService {
  constructor(
    private readonly database: PrismaService,
    private readonly authorization: ProviderAuthorizationPolicy,
    private readonly lifecycle: SessionLifecyclePolicy,
    private readonly timezone: TimezoneService,
  ) {}

  async create(
    principal: AuthPrincipal,
    providerId: string,
    activityId: string,
    input: CreateScheduleTemplateDto,
  ): Promise<ScheduleTemplateResponseDto> {
    return this.database.$transaction(async (transaction) => {
      await this.authorization.authorize(principal, providerId, scheduleManagerRoles, transaction);
      const activity = await transaction.activity.findFirst({
        where: { id: activityId, providerId },
        select: scheduleActivitySelect,
      });
      if (activity === null) throw activityNotFound();
      this.assertActivitySchedulable(activity.status);
      this.timezone.assertIanaZone(activity.provider.timezone);

      const start = this.timezone.parseLocalDate(input.generationStartDate);
      const end = this.timezone.parseLocalDate(input.generationEndDate);
      this.assertGenerationWindow(start, end);
      const duration = this.effectiveValue(
        input.durationMinutes,
        activity.durationMinutes,
        'SCHEDULE_DURATION_REQUIRED',
        'Duration is required when the activity has no default.',
      );
      const cutoff = this.effectiveValue(
        input.bookingCutoffMinutes,
        activity.bookingCutoffMinutes,
        'SCHEDULE_BOOKING_CUTOFF_REQUIRED',
        'Booking cutoff is required when the activity has no default.',
      );
      this.lifecycle.assertCapacity(input.capacity, 0, activity.maxParticipants);

      const record = await transaction.activityScheduleTemplate.create({
        data: {
          activityId,
          timezone: activity.provider.timezone,
          localStartTime: input.localStartTime,
          weekdays: [...input.weekdays].sort((left, right) => left - right),
          intervalWeeks: input.intervalWeeks,
          generationStartDate: start.toJSDate(),
          generationEndDate: end.toJSDate(),
          durationMinutes: duration,
          capacity: input.capacity,
          bookingCutoffMinutes: cutoff,
          dstOverlapPolicy: input.dstOverlapPolicy,
          dstGapPolicy: input.dstGapPolicy,
        },
        select: scheduleTemplateSelect,
      });
      return mapScheduleTemplate(record, this.timezone);
    });
  }

  async generate(
    principal: AuthPrincipal,
    providerId: string,
    activityId: string,
    scheduleId: string,
    input: GenerateScheduleDto,
  ): Promise<ScheduleGenerationResponseDto> {
    return this.database.$transaction(async (transaction) => {
      await this.authorization.authorize(principal, providerId, scheduleManagerRoles, transaction);
      const schedule = await transaction.activityScheduleTemplate.findFirst({
        where: { id: scheduleId, activityId, activity: { providerId } },
        select: {
          ...scheduleTemplateSelect,
          activity: { select: { status: true, maxParticipants: true } },
        },
      });
      if (schedule === null) throw scheduleNotFound();
      this.assertActivitySchedulable(schedule.activity.status);
      this.lifecycle.assertCapacity(schedule.capacity, 0, schedule.activity.maxParticipants);

      const start = DateTime.fromJSDate(schedule.generationStartDate, { zone: 'UTC' }).startOf(
        'day',
      );
      const configuredEnd = DateTime.fromJSDate(schedule.generationEndDate, {
        zone: 'UTC',
      }).startOf('day');
      const requestedEnd =
        input.throughDate === undefined
          ? configuredEnd
          : this.timezone.parseLocalDate(input.throughDate);
      if (requestedEnd < start || requestedEnd > configuredEnd) {
        throw invalidSchedule(
          'SCHEDULE_GENERATION_LIMIT_INVALID',
          'The generation limit must be inside the configured schedule window.',
        );
      }

      const now = new Date();
      const sessions: Prisma.ActivitySessionCreateManyInput[] = [];
      let skippedGapCount = 0;
      for (let date = start; date <= requestedEnd; date = date.plus({ days: 1 })) {
        if (!this.isOccurrenceDate(date, start, schedule.weekdays, schedule.intervalWeeks))
          continue;
        const localDateTime = `${date.toFormat('yyyy-MM-dd')}T${schedule.localStartTime}`;
        const resolved = this.timezone.resolveLocalDateTime(
          localDateTime,
          schedule.timezone,
          schedule.dstOverlapPolicy,
        );
        if (resolved === null) {
          skippedGapCount += 1;
          continue;
        }
        const bookingCutoffAt = subtractMinutes(resolved.instant, schedule.bookingCutoffMinutes);
        if (resolved.instant <= now || bookingCutoffAt <= now) continue;
        sessions.push({
          activityId,
          scheduleTemplateId: schedule.id,
          startsAt: resolved.instant,
          endsAt: addMinutes(resolved.instant, schedule.durationMinutes),
          timezone: schedule.timezone,
          utcOffsetMinutes: resolved.offsetMinutes,
          capacity: schedule.capacity,
          bookingCutoffMinutes: schedule.bookingCutoffMinutes,
          bookingCutoffAt,
        });
      }

      const inserted =
        sessions.length === 0
          ? { count: 0 }
          : await transaction.activitySession.createMany({ data: sessions, skipDuplicates: true });
      const generatedAt = new Date();
      const updated = await transaction.activityScheduleTemplate.update({
        where: { id: schedule.id },
        data: { lastGeneratedAt: generatedAt },
        select: scheduleTemplateSelect,
      });
      return {
        schedule: mapScheduleTemplate(updated, this.timezone),
        generatedCount: inserted.count,
        skippedGapCount,
      };
    });
  }

  private isOccurrenceDate(
    date: DateTime,
    start: DateTime,
    weekdays: number[],
    intervalWeeks: number,
  ): boolean {
    const elapsedDays = Math.round(date.diff(start, 'days').days);
    const intervalMatches = Math.floor(elapsedDays / 7) % intervalWeeks === 0;
    return intervalMatches && weekdays.includes(date.weekday);
  }

  private assertGenerationWindow(start: DateTime, end: DateTime): void {
    const days = end.diff(start, 'days').days;
    if (days < 0) {
      throw invalidSchedule(
        'SCHEDULE_RANGE_INVALID',
        'Generation end date must not precede its start date.',
      );
    }
    if (days > 366) {
      throw invalidSchedule(
        'SCHEDULE_RANGE_TOO_LARGE',
        'A recurring schedule can materialize at most 366 days.',
      );
    }
    if (end.endOf('day').toJSDate() <= new Date()) {
      throw invalidSchedule('SCHEDULE_RANGE_IN_PAST', 'Generation end date must be in the future.');
    }
  }

  private effectiveValue(
    provided: number | undefined,
    fallback: number | null,
    code: string,
    message: string,
  ): number {
    const value = provided ?? fallback;
    if (value === null) throw invalidSchedule(code, message);
    return value;
  }

  private assertActivitySchedulable(status: ActivityStatus): void {
    if (status === ActivityStatus.ARCHIVED) {
      throw invalidActivityOperation(
        'ACTIVITY_ARCHIVED',
        'Archived activities cannot be scheduled.',
      );
    }
  }
}
