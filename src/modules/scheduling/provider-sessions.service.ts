import { Injectable } from '@nestjs/common';

import type { AuthPrincipal } from '../../common/auth/auth-principal.js';
import { catalogPaginationMeta } from '../../common/pagination/catalog-pagination.dto.js';
import { ActivityStatus, ProviderMembershipRole } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { activityNotFound, invalidActivityOperation } from '../activities/activity-errors.js';
import { isUniqueConstraintError } from '../organizations/organization-errors.js';
import { ProviderAuthorizationPolicy } from '../providers/provider-authorization.policy.js';
import type {
  CancelSessionDto,
  CreateOneTimeSessionDto,
  ProviderSessionListQueryDto,
  UpdateSessionDto,
} from './dto/scheduling-request.dto.js';
import type {
  ProviderSessionPageResponseDto,
  ProviderSessionResponseDto,
} from './dto/scheduling-response.dto.js';
import { mapProviderSession, sessionSelect } from './scheduling.mapper.js';
import { invalidSchedule, schedulingConflict, sessionNotFound } from './scheduling-errors.js';
import { addMinutes, subtractMinutes } from './scheduling-time.js';
import { SessionLifecyclePolicy } from './session-lifecycle.policy.js';
import { TimezoneService } from './timezone.service.js';

const sessionManagerRoles = [ProviderMembershipRole.ADMIN, ProviderMembershipRole.STAFF] as const;

const activitySchedulingSelect = {
  id: true,
  status: true,
  durationMinutes: true,
  bookingCutoffMinutes: true,
  maxParticipants: true,
  provider: { select: { timezone: true } },
} as const;

@Injectable()
export class ProviderSessionsService {
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
    input: CreateOneTimeSessionDto,
  ): Promise<ProviderSessionResponseDto> {
    try {
      return await this.database.$transaction(async (transaction) => {
        await this.authorization.authorize(principal, providerId, sessionManagerRoles, transaction);
        const activity = await transaction.activity.findFirst({
          where: { id: activityId, providerId },
          select: activitySchedulingSelect,
        });
        if (activity === null) throw activityNotFound();
        this.assertActivitySchedulable(activity.status);

        const duration = this.effectiveValue(
          input.durationMinutes,
          activity.durationMinutes,
          'SESSION_DURATION_REQUIRED',
          'Duration is required when the activity has no default.',
        );
        const cutoff = this.effectiveValue(
          input.bookingCutoffMinutes,
          activity.bookingCutoffMinutes,
          'SESSION_BOOKING_CUTOFF_REQUIRED',
          'Booking cutoff is required when the activity has no default.',
        );
        this.lifecycle.assertCapacity(input.capacity, 0, activity.maxParticipants);
        const resolved = this.timezone.resolveLocalDateTime(
          input.localStartsAt,
          activity.provider.timezone,
          input.dstOverlapPolicy,
        );
        if (resolved === null) {
          throw invalidSchedule(
            'SESSION_LOCAL_TIME_NONEXISTENT',
            'The provider-local start time does not exist because of a timezone transition.',
          );
        }
        const now = new Date();
        this.assertFutureStart(resolved.instant, now);
        const bookingCutoffAt = subtractMinutes(resolved.instant, cutoff);
        if (bookingCutoffAt <= now) {
          throw invalidSchedule(
            'SESSION_BOOKING_CUTOFF_PASSED',
            'The effective booking cutoff must be in the future when a session is created.',
          );
        }

        const record = await transaction.activitySession.create({
          data: {
            activityId,
            startsAt: resolved.instant,
            endsAt: addMinutes(resolved.instant, duration),
            timezone: activity.provider.timezone,
            utcOffsetMinutes: resolved.offsetMinutes,
            capacity: input.capacity,
            bookingCutoffMinutes: cutoff,
            bookingCutoffAt,
          },
          select: sessionSelect,
        });
        return mapProviderSession(record, this.timezone);
      });
    } catch (error: unknown) {
      if (isUniqueConstraintError(error)) {
        throw schedulingConflict(
          'SESSION_START_CONFLICT',
          'This activity already has a session at the selected instant.',
        );
      }
      throw error;
    }
  }

  async list(
    principal: AuthPrincipal,
    providerId: string,
    activityId: string,
    query: ProviderSessionListQueryDto,
  ): Promise<ProviderSessionPageResponseDto> {
    await this.authorization.authorize(principal, providerId, sessionManagerRoles);
    await this.assertOwnedActivity(providerId, activityId);
    const range = this.optionalRange(query.from, query.to);
    const records = await this.database.activitySession.findMany({
      where: {
        activityId,
        ...(query.status === undefined ? {} : { status: query.status }),
        ...(range === undefined ? {} : { startsAt: range }),
      },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit + 1,
      select: sessionSelect,
    });
    const hasNextPage = records.length > query.limit;
    return {
      data: records
        .slice(0, query.limit)
        .map((record) => mapProviderSession(record, this.timezone)),
      meta: catalogPaginationMeta(query.page, query.limit, hasNextPage),
    };
  }

  async update(
    principal: AuthPrincipal,
    providerId: string,
    sessionId: string,
    input: UpdateSessionDto,
  ): Promise<ProviderSessionResponseDto> {
    this.assertUpdate(input);
    try {
      return await this.database.$transaction(async (transaction) => {
        await this.authorization.authorize(principal, providerId, sessionManagerRoles, transaction);
        const existing = await transaction.activitySession.findFirst({
          where: { id: sessionId, activity: { providerId } },
          select: {
            ...sessionSelect,
            activity: { select: activitySchedulingSelect },
          },
        });
        if (existing === null) throw sessionNotFound();
        this.lifecycle.assertMutable(existing.status);
        if (existing.startsAt <= new Date()) {
          throw invalidSchedule('SESSION_ALREADY_STARTED', 'A started session cannot be changed.');
        }

        const changesTime =
          input.localStartsAt !== undefined || input.durationMinutes !== undefined;
        if (changesTime) this.lifecycle.assertTimeMutable(existing.bookedCount);
        if (input.dstOverlapPolicy !== undefined && input.localStartsAt === undefined) {
          throw invalidSchedule(
            'SESSION_DST_POLICY_WITHOUT_LOCAL_TIME',
            'A DST overlap policy is valid only with a new local start time.',
          );
        }

        const resolved =
          input.localStartsAt === undefined
            ? undefined
            : this.timezone.resolveLocalDateTime(
                input.localStartsAt,
                existing.activity.provider.timezone,
                input.dstOverlapPolicy,
              );
        if (resolved === null) {
          throw invalidSchedule(
            'SESSION_LOCAL_TIME_NONEXISTENT',
            'The provider-local start time does not exist because of a timezone transition.',
          );
        }
        const startsAt = resolved?.instant ?? existing.startsAt;
        if (input.localStartsAt !== undefined) this.assertFutureStart(startsAt, new Date());
        const duration =
          input.durationMinutes ??
          Math.round((existing.endsAt.getTime() - existing.startsAt.getTime()) / 60_000);
        const capacity = input.capacity ?? existing.capacity;
        this.lifecycle.assertCapacity(
          capacity,
          existing.bookedCount,
          existing.activity.maxParticipants,
        );
        const cutoff = input.bookingCutoffMinutes ?? existing.bookingCutoffMinutes;

        const record = await transaction.activitySession.update({
          where: { id: sessionId },
          data: {
            ...(input.localStartsAt === undefined ? {} : { startsAt }),
            ...(changesTime ? { endsAt: addMinutes(startsAt, duration) } : {}),
            ...(resolved === undefined
              ? {}
              : {
                  timezone: existing.activity.provider.timezone,
                  utcOffsetMinutes: resolved.offsetMinutes,
                }),
            ...(input.capacity === undefined ? {} : { capacity }),
            ...(input.bookingCutoffMinutes === undefined && input.localStartsAt === undefined
              ? {}
              : {
                  bookingCutoffMinutes: cutoff,
                  bookingCutoffAt: subtractMinutes(startsAt, cutoff),
                }),
            version: { increment: 1 },
          },
          select: sessionSelect,
        });
        return mapProviderSession(record, this.timezone);
      });
    } catch (error: unknown) {
      if (isUniqueConstraintError(error)) {
        throw schedulingConflict(
          'SESSION_START_CONFLICT',
          'This activity already has a session at the selected instant.',
        );
      }
      throw error;
    }
  }

  async cancel(
    principal: AuthPrincipal,
    providerId: string,
    sessionId: string,
    input: CancelSessionDto,
  ): Promise<ProviderSessionResponseDto> {
    return this.database.$transaction(async (transaction) => {
      await this.authorization.authorize(principal, providerId, sessionManagerRoles, transaction);
      const existing = await transaction.activitySession.findFirst({
        where: { id: sessionId, activity: { providerId } },
        select: sessionSelect,
      });
      if (existing === null) throw sessionNotFound();
      if (existing.status === 'CANCELLED') return mapProviderSession(existing, this.timezone);
      this.lifecycle.assertCancellable(existing.status, existing.bookedCount);
      const record = await transaction.activitySession.update({
        where: { id: sessionId },
        data: {
          status: 'CANCELLED',
          cancellationReason: input.reason,
          cancelledAt: new Date(),
          cancelledByUserId: principal.userId,
          version: { increment: 1 },
        },
        select: sessionSelect,
      });
      return mapProviderSession(record, this.timezone);
    });
  }

  async complete(
    principal: AuthPrincipal,
    providerId: string,
    sessionId: string,
  ): Promise<ProviderSessionResponseDto> {
    return this.database.$transaction(async (transaction) => {
      await this.authorization.authorize(principal, providerId, sessionManagerRoles, transaction);
      const existing = await transaction.activitySession.findFirst({
        where: { id: sessionId, activity: { providerId } },
        select: sessionSelect,
      });
      if (existing === null) throw sessionNotFound();
      if (existing.status === 'COMPLETED') return mapProviderSession(existing, this.timezone);
      this.lifecycle.assertCompletable(existing.status, existing.endsAt, new Date());
      const record = await transaction.activitySession.update({
        where: { id: sessionId },
        data: { status: 'COMPLETED', completedAt: new Date(), version: { increment: 1 } },
        select: sessionSelect,
      });
      return mapProviderSession(record, this.timezone);
    });
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

  private assertFutureStart(startsAt: Date, now: Date): void {
    if (startsAt <= now) {
      throw invalidSchedule('SESSION_START_NOT_FUTURE', 'Session start must be in the future.');
    }
  }

  private assertUpdate(input: UpdateSessionDto): void {
    if (Object.values(input).every((value) => value === undefined)) {
      throw invalidSchedule('SESSION_UPDATE_EMPTY', 'At least one session field is required.');
    }
  }

  private async assertOwnedActivity(providerId: string, activityId: string): Promise<void> {
    const activity = await this.database.activity.findFirst({
      where: { id: activityId, providerId },
      select: { id: true },
    });
    if (activity === null) throw activityNotFound();
  }

  private optionalRange(
    from: string | undefined,
    to: string | undefined,
  ): { gte?: Date; lte?: Date } | undefined {
    if (from === undefined && to === undefined) return undefined;
    const lower = from === undefined ? undefined : new Date(from);
    const upper = to === undefined ? undefined : new Date(to);
    if (lower !== undefined && upper !== undefined && upper < lower) {
      throw invalidSchedule('SESSION_RANGE_INVALID', 'The range end must not precede its start.');
    }
    return {
      ...(lower === undefined ? {} : { gte: lower }),
      ...(upper === undefined ? {} : { lte: upper }),
    };
  }
}
