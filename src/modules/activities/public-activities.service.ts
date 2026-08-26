import { Injectable } from '@nestjs/common';

import { catalogPaginationMeta } from '../../common/pagination/catalog-pagination.dto.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { ActivityStatus, OrganizationStatus } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { activityNotFound, invalidActivityOperation } from './activity-errors.js';
import { parseMinorUnits } from './activity-money.js';
import {
  mapPublicActivity,
  mapPublicActivitySummary,
  publicActivityListSelect,
  publicActivitySelect,
} from './activity.mapper.js';
import { activityFilterWhere, activityOrderBy } from './activity-query.js';
import { PublicActivitySort } from './dto/activity-api.enums.js';
import type { PublicActivityListQueryDto } from './dto/activity-request.dto.js';
import type {
  PublicActivityPageResponseDto,
  PublicActivityResponseDto,
} from './dto/activity-response.dto.js';

@Injectable()
export class PublicActivitiesService {
  constructor(private readonly database: PrismaService) {}

  async list(query: PublicActivityListQueryDto): Promise<PublicActivityPageResponseDto> {
    const minimumPrice =
      query.minPriceMinor === undefined ? undefined : parseMinorUnits(query.minPriceMinor);
    const maximumPrice =
      query.maxPriceMinor === undefined ? undefined : parseMinorUnits(query.maxPriceMinor);
    this.assertPriceQuery(query, minimumPrice, maximumPrice);
    const where: Prisma.ActivityWhereInput = {
      status: ActivityStatus.PUBLISHED,
      provider: { status: OrganizationStatus.ACTIVE },
      category: { isActive: true },
      ...activityFilterWhere(query),
      ...(query.providerId === undefined ? {} : { providerId: query.providerId }),
      ...(query.currency === undefined ? {} : { currency: query.currency }),
      ...(minimumPrice === undefined && maximumPrice === undefined
        ? {}
        : {
            priceMinor: {
              ...(minimumPrice === undefined ? {} : { gte: minimumPrice }),
              ...(maximumPrice === undefined ? {} : { lte: maximumPrice }),
            },
          }),
    };
    const records = await this.database.activity.findMany({
      where,
      orderBy: activityOrderBy(query.sort),
      skip: (query.page - 1) * query.limit,
      take: query.limit + 1,
      select: publicActivityListSelect,
    });
    const hasNextPage = records.length > query.limit;
    return {
      data: records.slice(0, query.limit).map(mapPublicActivitySummary),
      meta: catalogPaginationMeta(query.page, query.limit, hasNextPage),
    };
  }

  async get(activityId: string): Promise<PublicActivityResponseDto> {
    const record = await this.database.activity.findFirst({
      where: {
        id: activityId,
        status: ActivityStatus.PUBLISHED,
        provider: { status: OrganizationStatus.ACTIVE },
        category: { isActive: true },
      },
      select: publicActivitySelect,
    });
    if (record === null) throw activityNotFound();
    return mapPublicActivity(record);
  }

  private assertPriceQuery(
    query: PublicActivityListQueryDto,
    minimum: bigint | undefined,
    maximum: bigint | undefined,
  ): void {
    const usesPrice =
      minimum !== undefined ||
      maximum !== undefined ||
      query.sort === PublicActivitySort.PRICE_ASC ||
      query.sort === PublicActivitySort.PRICE_DESC;
    if (usesPrice && query.currency === undefined) {
      throw invalidActivityOperation(
        'ACTIVITY_PRICE_CURRENCY_REQUIRED',
        'Currency is required when filtering or sorting by price.',
      );
    }
    if (minimum !== undefined && maximum !== undefined && maximum < minimum) {
      throw invalidActivityOperation(
        'ACTIVITY_PRICE_RANGE_INVALID',
        'Maximum price must be greater than or equal to minimum price.',
      );
    }
  }
}
