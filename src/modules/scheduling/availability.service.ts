import { Injectable } from '@nestjs/common';

import { catalogPaginationMeta } from '../../common/pagination/catalog-pagination.dto.js';
import {
  ActivitySessionStatus,
  ActivityStatus,
  OrganizationStatus,
} from '../../generated/prisma/enums.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { activityNotFound } from '../activities/activity-errors.js';
import type { AvailabilityQueryDto } from './dto/scheduling-request.dto.js';
import type { SessionPageResponseDto } from './dto/scheduling-response.dto.js';
import { mapAvailabilitySession, sessionSelect } from './scheduling.mapper.js';
import { invalidSchedule } from './scheduling-errors.js';
import { TimezoneService } from './timezone.service.js';

const MAX_AVAILABILITY_WINDOW_MS = 180 * 24 * 60 * 60 * 1000;
const DEFAULT_AVAILABILITY_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly database: PrismaService,
    private readonly timezone: TimezoneService,
  ) {}

  async list(activityId: string, query: AvailabilityQueryDto): Promise<SessionPageResponseDto> {
    const activity = await this.database.activity.findFirst({
      where: {
        id: activityId,
        status: ActivityStatus.PUBLISHED,
        provider: { status: OrganizationStatus.ACTIVE },
        category: { isActive: true },
      },
      select: { id: true },
    });
    if (activity === null) throw activityNotFound();

    const now = new Date();
    const requestedFrom = query.from === undefined ? now : new Date(query.from);
    const from = requestedFrom < now ? now : requestedFrom;
    const to =
      query.to === undefined
        ? new Date(from.getTime() + DEFAULT_AVAILABILITY_WINDOW_MS)
        : new Date(query.to);
    if (to < from) {
      throw invalidSchedule('SESSION_RANGE_INVALID', 'The range end must not precede its start.');
    }
    if (to.getTime() - from.getTime() > MAX_AVAILABILITY_WINDOW_MS) {
      throw invalidSchedule(
        'SESSION_RANGE_TOO_LARGE',
        'Availability can be requested for at most 180 days.',
      );
    }

    const records = await this.database.activitySession.findMany({
      where: {
        activityId,
        status: ActivitySessionStatus.SCHEDULED,
        startsAt: { gte: from, lte: to },
        bookingCutoffAt: { gt: now },
        bookedCount: { lt: this.database.activitySession.fields.capacity },
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
        .map((record) => mapAvailabilitySession(record, this.timezone)),
      meta: catalogPaginationMeta(query.page, query.limit, hasNextPage),
    };
  }
}
