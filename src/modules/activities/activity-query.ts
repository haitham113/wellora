import type { Prisma } from '../../generated/prisma/client.js';
import type { ActivityFiltersDto } from './dto/activity-request.dto.js';
import {
  ProviderActivitySort,
  PublicActivitySort,
  type ProviderActivitySort as ProviderActivitySortValue,
  type PublicActivitySort as PublicActivitySortValue,
} from './dto/activity-api.enums.js';

export function activityFilterWhere(query: ActivityFiltersDto): Prisma.ActivityWhereInput {
  const search = normalizeSearch(query.search);
  return {
    ...(search === undefined ? {} : { searchText: { contains: search } }),
    ...(query.categoryId === undefined ? {} : { categoryId: query.categoryId }),
    ...(query.locationType === undefined ? {} : { locationType: query.locationType }),
    ...(query.country === undefined ? {} : { country: query.country }),
    ...(query.city === undefined ? {} : { normalizedCity: normalizeLocation(query.city) }),
  };
}

export function activityOrderBy(
  sort: PublicActivitySortValue | ProviderActivitySortValue,
): Prisma.ActivityOrderByWithRelationInput[] {
  switch (sort) {
    case PublicActivitySort.PRICE_ASC:
      return [{ priceMinor: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }];
    case PublicActivitySort.PRICE_DESC:
      return [{ priceMinor: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }];
    case PublicActivitySort.TITLE_ASC:
      return [{ title: 'asc' }, { id: 'asc' }];
    case PublicActivitySort.DURATION_ASC:
      return [{ durationMinutes: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }];
    case PublicActivitySort.PUBLISHED_DESC:
      return [{ publishedAt: 'desc' }, { id: 'desc' }];
    case ProviderActivitySort.CREATED_DESC:
      return [{ createdAt: 'desc' }, { id: 'desc' }];
  }
}

export function normalizeLocation(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase();
}

function normalizeSearch(value: string | undefined): string | undefined {
  const normalized = value?.normalize('NFKC').trim().toLowerCase();
  return normalized === undefined || normalized.length === 0 ? undefined : normalized;
}
