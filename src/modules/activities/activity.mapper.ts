import type { Prisma } from '../../generated/prisma/client.js';
import type {
  ProviderActivityResponseDto,
  ProviderActivitySummaryResponseDto,
  PublicActivityResponseDto,
  PublicActivitySummaryResponseDto,
} from './dto/activity-response.dto.js';

const mediaSelect = {
  select: { id: true, type: true, url: true, altText: true, displayOrder: true },
  orderBy: [{ displayOrder: 'asc' as const }, { id: 'asc' as const }],
};

const publicActivityBaseSelect = {
  id: true,
  title: true,
  slug: true,
  shortDescription: true,
  priceMinor: true,
  currency: true,
  durationMinutes: true,
  locationType: true,
  venueName: true,
  city: true,
  region: true,
  country: true,
  publishedAt: true,
  provider: {
    select: { id: true, businessName: true, slug: true },
  },
  category: {
    select: { id: true, name: true, slug: true },
  },
} satisfies Prisma.ActivitySelect;

export const publicActivityListSelect = {
  ...publicActivityBaseSelect,
  media: {
    ...mediaSelect,
    take: 1,
  },
} satisfies Prisma.ActivitySelect;

export const publicActivitySelect = {
  ...publicActivityBaseSelect,
  fullDescription: true,
  addressLine1: true,
  addressLine2: true,
  postalCode: true,
  onlineUrl: true,
  minParticipants: true,
  maxParticipants: true,
  cancellationPolicy: true,
  cancellationWindowMinutes: true,
  bookingCutoffMinutes: true,
  media: mediaSelect,
} satisfies Prisma.ActivitySelect;

export const providerActivityListSelect = {
  ...publicActivityBaseSelect,
  status: true,
  createdAt: true,
  updatedAt: true,
  media: {
    ...mediaSelect,
    take: 1,
  },
} satisfies Prisma.ActivitySelect;

export const providerActivitySelect = {
  ...providerActivityListSelect,
  fullDescription: true,
  addressLine1: true,
  addressLine2: true,
  postalCode: true,
  onlineUrl: true,
  minParticipants: true,
  maxParticipants: true,
  cancellationPolicy: true,
  cancellationWindowMinutes: true,
  bookingCutoffMinutes: true,
  media: mediaSelect,
} satisfies Prisma.ActivitySelect;

export type PublicActivityRecord = Prisma.ActivityGetPayload<{
  select: typeof publicActivitySelect;
}>;
export type PublicActivityListRecord = Prisma.ActivityGetPayload<{
  select: typeof publicActivityListSelect;
}>;
export type ProviderActivityRecord = Prisma.ActivityGetPayload<{
  select: typeof providerActivitySelect;
}>;
export type ProviderActivityListRecord = Prisma.ActivityGetPayload<{
  select: typeof providerActivityListSelect;
}>;

export function mapPublicActivitySummary(
  record: PublicActivityListRecord,
): PublicActivitySummaryResponseDto {
  return {
    ...record,
    shortDescription: requiredPublished(record.shortDescription, 'shortDescription'),
    priceMinor: requiredPublished(record.priceMinor, 'priceMinor').toString(),
    currency: requiredPublished(record.currency, 'currency'),
    durationMinutes: requiredPublished(record.durationMinutes, 'durationMinutes'),
    locationType: requiredPublished(record.locationType, 'locationType'),
    publishedAt: requiredPublished(record.publishedAt, 'publishedAt').toISOString(),
  };
}

export function mapPublicActivity(record: PublicActivityRecord): PublicActivityResponseDto {
  return Object.assign(mapPublicActivitySummary(record), {
    fullDescription: requiredPublished(record.fullDescription, 'fullDescription'),
    addressLine1: record.addressLine1,
    addressLine2: record.addressLine2,
    postalCode: record.postalCode,
    onlineUrl: record.onlineUrl,
    minParticipants: requiredPublished(record.minParticipants, 'minParticipants'),
    maxParticipants: requiredPublished(record.maxParticipants, 'maxParticipants'),
    cancellationPolicy: requiredPublished(record.cancellationPolicy, 'cancellationPolicy'),
    cancellationWindowMinutes: requiredPublished(
      record.cancellationWindowMinutes,
      'cancellationWindowMinutes',
    ),
    bookingCutoffMinutes: requiredPublished(record.bookingCutoffMinutes, 'bookingCutoffMinutes'),
    media: record.media,
  });
}

export function mapProviderActivitySummary(
  record: ProviderActivityListRecord,
): ProviderActivitySummaryResponseDto {
  return {
    ...record,
    priceMinor: record.priceMinor?.toString() ?? null,
    publishedAt: record.publishedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function mapProviderActivity(record: ProviderActivityRecord): ProviderActivityResponseDto {
  return Object.assign(mapProviderActivitySummary(record), {
    fullDescription: record.fullDescription,
    addressLine1: record.addressLine1,
    addressLine2: record.addressLine2,
    postalCode: record.postalCode,
    onlineUrl: record.onlineUrl,
    minParticipants: record.minParticipants,
    maxParticipants: record.maxParticipants,
    cancellationPolicy: record.cancellationPolicy,
    cancellationWindowMinutes: record.cancellationWindowMinutes,
    bookingCutoffMinutes: record.bookingCutoffMinutes,
    media: record.media,
  });
}

function requiredPublished<T>(value: T | null, field: string): T {
  if (value === null) {
    throw new Error(`Published activity invariant violated for ${field}.`);
  }
  return value;
}
