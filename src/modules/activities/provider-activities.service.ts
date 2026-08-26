import { Injectable } from '@nestjs/common';

import type { AuthPrincipal } from '../../common/auth/auth-principal.js';
import { catalogPaginationMeta } from '../../common/pagination/catalog-pagination.dto.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { ActivityStatus, ProviderMembershipRole } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { isUniqueConstraintError, normalizeSlug } from '../organizations/organization-errors.js';
import { ProviderAuthorizationPolicy } from '../providers/provider-authorization.policy.js';
import {
  activityConflict,
  activityNotFound,
  categoryNotFound,
  invalidActivityOperation,
} from './activity-errors.js';
import { ActivityLifecyclePolicy, type PublishableActivity } from './activity-lifecycle.policy.js';
import { parseMinorUnits } from './activity-money.js';
import {
  mapProviderActivity,
  mapProviderActivitySummary,
  providerActivityListSelect,
  providerActivitySelect,
} from './activity.mapper.js';
import { activityFilterWhere, activityOrderBy, normalizeLocation } from './activity-query.js';
import type {
  ActivityMediaInputDto,
  CreateActivityDto,
  ProviderActivityListQueryDto,
  UpdateActivityDto,
} from './dto/activity-request.dto.js';
import type {
  ProviderActivityPageResponseDto,
  ProviderActivityResponseDto,
} from './dto/activity-response.dto.js';

const editorRoles = [ProviderMembershipRole.ADMIN, ProviderMembershipRole.STAFF] as const;
const administratorRoles = [ProviderMembershipRole.ADMIN] as const;

const lifecycleSelect = {
  id: true,
  status: true,
  categoryId: true,
  shortDescription: true,
  fullDescription: true,
  priceMinor: true,
  currency: true,
  durationMinutes: true,
  locationType: true,
  addressLine1: true,
  city: true,
  country: true,
  onlineUrl: true,
  minParticipants: true,
  maxParticipants: true,
  cancellationPolicy: true,
  cancellationWindowMinutes: true,
  bookingCutoffMinutes: true,
  publishedAt: true,
  provider: { select: { status: true } },
  category: { select: { isActive: true } },
} satisfies Prisma.ActivitySelect;

type LifecycleRecord = Prisma.ActivityGetPayload<{ select: typeof lifecycleSelect }>;
type MutableActivityData = Partial<
  Omit<
    Prisma.ActivityCreateManyInput,
    'id' | 'providerId' | 'categoryId' | 'status' | 'publishedAt' | 'createdAt' | 'updatedAt'
  >
>;

@Injectable()
export class ProviderActivitiesService {
  constructor(
    private readonly database: PrismaService,
    private readonly authorization: ProviderAuthorizationPolicy,
    private readonly lifecycle: ActivityLifecyclePolicy,
  ) {}

  async create(
    principal: AuthPrincipal,
    providerId: string,
    input: CreateActivityDto,
  ): Promise<ProviderActivityResponseDto> {
    this.assertParticipantRange(input.minParticipants, input.maxParticipants);
    try {
      return await this.database.$transaction(async (transaction) => {
        await this.authorization.authorize(principal, providerId, editorRoles, transaction);
        await this.assertCategoryExists(input.categoryId, transaction);
        const record = await transaction.activity.create({
          data: {
            provider: { connect: { id: providerId } },
            category: { connect: { id: input.categoryId } },
            title: requiredText(input.title, 'title'),
            slug: input.slug,
            normalizedSlug: normalizeSlug(input.slug),
            ...this.mutableData(input),
            ...(input.media === undefined
              ? {}
              : { media: { create: input.media.map((item) => this.mediaData(item)) } }),
          },
          select: providerActivitySelect,
        });
        return mapProviderActivity(record);
      });
    } catch (error: unknown) {
      this.rethrowConflict(error);
    }
  }

  async list(
    principal: AuthPrincipal,
    providerId: string,
    query: ProviderActivityListQueryDto,
  ): Promise<ProviderActivityPageResponseDto> {
    await this.authorization.authorize(principal, providerId, editorRoles);
    const where: Prisma.ActivityWhereInput = {
      providerId,
      ...activityFilterWhere(query),
      ...(query.status === undefined ? {} : { status: query.status }),
    };
    const records = await this.database.activity.findMany({
      where,
      orderBy: activityOrderBy(query.sort),
      skip: (query.page - 1) * query.limit,
      take: query.limit + 1,
      select: providerActivityListSelect,
    });
    const hasNextPage = records.length > query.limit;
    return {
      data: records.slice(0, query.limit).map(mapProviderActivitySummary),
      meta: catalogPaginationMeta(query.page, query.limit, hasNextPage),
    };
  }

  async get(
    principal: AuthPrincipal,
    providerId: string,
    activityId: string,
  ): Promise<ProviderActivityResponseDto> {
    await this.authorization.authorize(principal, providerId, editorRoles);
    const record = await this.database.activity.findFirst({
      where: { id: activityId, providerId },
      select: providerActivitySelect,
    });
    if (record === null) throw activityNotFound();
    return mapProviderActivity(record);
  }

  async update(
    principal: AuthPrincipal,
    providerId: string,
    activityId: string,
    input: UpdateActivityDto,
  ): Promise<ProviderActivityResponseDto> {
    this.assertNonEmptyUpdate(input);
    try {
      return await this.database.$transaction(async (transaction) => {
        await this.authorization.authorize(principal, providerId, editorRoles, transaction);
        const existing = await transaction.activity.findFirst({
          where: { id: activityId, providerId },
          select: lifecycleSelect,
        });
        if (existing === null) throw activityNotFound();
        this.lifecycle.assertMutable(existing.status);

        const category =
          input.categoryId === undefined || input.categoryId === existing.categoryId
            ? existing.category
            : await this.getCategory(input.categoryId, transaction);
        const merged = this.mergePublishable(existing, input);
        this.assertParticipantRange(merged.minParticipants, merged.maxParticipants);
        if (existing.status === ActivityStatus.PUBLISHED) {
          this.lifecycle.assertPublishable(merged, category.isActive, existing.provider.status);
        }

        const record = await transaction.activity.update({
          where: { id: activityId },
          data: {
            ...this.mutableData(input),
            ...(input.categoryId === undefined
              ? {}
              : { category: { connect: { id: input.categoryId } } }),
            ...(input.media === undefined
              ? {}
              : {
                  media: {
                    deleteMany: {},
                    create: input.media.map((item) => this.mediaData(item)),
                  },
                }),
          },
          select: providerActivitySelect,
        });
        return mapProviderActivity(record);
      });
    } catch (error: unknown) {
      this.rethrowConflict(error);
    }
  }

  publish(
    principal: AuthPrincipal,
    providerId: string,
    activityId: string,
  ): Promise<ProviderActivityResponseDto> {
    return this.transition(
      principal,
      providerId,
      activityId,
      ActivityStatus.PUBLISHED,
      administratorRoles,
    );
  }

  pause(
    principal: AuthPrincipal,
    providerId: string,
    activityId: string,
  ): Promise<ProviderActivityResponseDto> {
    return this.transition(principal, providerId, activityId, ActivityStatus.PAUSED, editorRoles);
  }

  archive(
    principal: AuthPrincipal,
    providerId: string,
    activityId: string,
  ): Promise<ProviderActivityResponseDto> {
    return this.transition(
      principal,
      providerId,
      activityId,
      ActivityStatus.ARCHIVED,
      administratorRoles,
    );
  }

  private async transition(
    principal: AuthPrincipal,
    providerId: string,
    activityId: string,
    target: ActivityStatus,
    roles: readonly ProviderMembershipRole[],
  ): Promise<ProviderActivityResponseDto> {
    return this.database.$transaction(async (transaction) => {
      await this.authorization.authorize(principal, providerId, roles, transaction);
      const existing = await transaction.activity.findFirst({
        where: { id: activityId, providerId },
        select: lifecycleSelect,
      });
      if (existing === null) throw activityNotFound();
      this.lifecycle.assertTransition(existing.status, target);
      if (target === ActivityStatus.PUBLISHED) {
        this.lifecycle.assertPublishable(
          existing,
          existing.category.isActive,
          existing.provider.status,
        );
      }
      const record = await transaction.activity.update({
        where: { id: activityId },
        data: {
          status: target,
          ...(target === ActivityStatus.PUBLISHED && existing.publishedAt === null
            ? { publishedAt: new Date() }
            : {}),
        },
        select: providerActivitySelect,
      });
      return mapProviderActivity(record);
    });
  }

  private mutableData(input: CreateActivityDto | UpdateActivityDto): MutableActivityData {
    return {
      ...(input.title === undefined ? {} : { title: requiredText(input.title, 'title') }),
      ...(input.slug === undefined
        ? {}
        : { slug: input.slug, normalizedSlug: normalizeSlug(input.slug) }),
      ...(input.shortDescription === undefined
        ? {}
        : { shortDescription: optionalText(input.shortDescription) }),
      ...(input.fullDescription === undefined
        ? {}
        : { fullDescription: optionalText(input.fullDescription) }),
      ...(input.priceMinor === undefined
        ? {}
        : { priceMinor: input.priceMinor === null ? null : parseMinorUnits(input.priceMinor) }),
      ...(input.currency === undefined ? {} : { currency: input.currency }),
      ...(input.durationMinutes === undefined ? {} : { durationMinutes: input.durationMinutes }),
      ...(input.locationType === undefined ? {} : { locationType: input.locationType }),
      ...(input.venueName === undefined ? {} : { venueName: optionalText(input.venueName) }),
      ...(input.addressLine1 === undefined
        ? {}
        : { addressLine1: optionalText(input.addressLine1) }),
      ...(input.addressLine2 === undefined
        ? {}
        : { addressLine2: optionalText(input.addressLine2) }),
      ...(input.city === undefined ? {} : cityData(input.city)),
      ...(input.region === undefined ? {} : { region: optionalText(input.region) }),
      ...(input.postalCode === undefined ? {} : { postalCode: optionalText(input.postalCode) }),
      ...(input.country === undefined ? {} : { country: input.country }),
      ...(input.onlineUrl === undefined ? {} : { onlineUrl: optionalText(input.onlineUrl) }),
      ...(input.minParticipants === undefined ? {} : { minParticipants: input.minParticipants }),
      ...(input.maxParticipants === undefined ? {} : { maxParticipants: input.maxParticipants }),
      ...(input.cancellationPolicy === undefined
        ? {}
        : { cancellationPolicy: optionalText(input.cancellationPolicy) }),
      ...(input.cancellationWindowMinutes === undefined
        ? {}
        : { cancellationWindowMinutes: input.cancellationWindowMinutes }),
      ...(input.bookingCutoffMinutes === undefined
        ? {}
        : { bookingCutoffMinutes: input.bookingCutoffMinutes }),
    };
  }

  private mediaData(item: ActivityMediaInputDto): Prisma.ActivityMediaCreateWithoutActivityInput {
    return {
      type: item.type,
      url: item.url,
      altText: optionalText(item.altText),
      displayOrder: item.displayOrder,
    };
  }

  private mergePublishable(
    existing: LifecycleRecord,
    input: UpdateActivityDto,
  ): PublishableActivity {
    return {
      shortDescription: mergedText(input.shortDescription, existing.shortDescription),
      fullDescription: mergedText(input.fullDescription, existing.fullDescription),
      priceMinor:
        input.priceMinor === undefined
          ? existing.priceMinor
          : input.priceMinor === null
            ? null
            : parseMinorUnits(input.priceMinor),
      currency: input.currency === undefined ? existing.currency : input.currency,
      durationMinutes:
        input.durationMinutes === undefined ? existing.durationMinutes : input.durationMinutes,
      locationType: input.locationType === undefined ? existing.locationType : input.locationType,
      addressLine1: mergedText(input.addressLine1, existing.addressLine1),
      city: mergedText(input.city, existing.city),
      country: input.country === undefined ? existing.country : input.country,
      onlineUrl: mergedText(input.onlineUrl, existing.onlineUrl),
      minParticipants:
        input.minParticipants === undefined ? existing.minParticipants : input.minParticipants,
      maxParticipants:
        input.maxParticipants === undefined ? existing.maxParticipants : input.maxParticipants,
      cancellationPolicy: mergedText(input.cancellationPolicy, existing.cancellationPolicy),
      cancellationWindowMinutes:
        input.cancellationWindowMinutes === undefined
          ? existing.cancellationWindowMinutes
          : input.cancellationWindowMinutes,
      bookingCutoffMinutes:
        input.bookingCutoffMinutes === undefined
          ? existing.bookingCutoffMinutes
          : input.bookingCutoffMinutes,
    };
  }

  private async assertCategoryExists(
    categoryId: string,
    database: Pick<PrismaService, 'category'>,
  ): Promise<void> {
    await this.getCategory(categoryId, database);
  }

  private async getCategory(
    categoryId: string,
    database: Pick<PrismaService, 'category'>,
  ): Promise<{ isActive: boolean }> {
    const category = await database.category.findUnique({
      where: { id: categoryId },
      select: { isActive: true },
    });
    if (category === null) throw categoryNotFound();
    return category;
  }

  private assertParticipantRange(
    minimum: number | null | undefined,
    maximum: number | null | undefined,
  ): void {
    if (
      minimum !== null &&
      minimum !== undefined &&
      maximum !== null &&
      maximum !== undefined &&
      maximum < minimum
    ) {
      throw invalidActivityOperation(
        'ACTIVITY_PARTICIPANT_RANGE_INVALID',
        'Maximum participants must be greater than or equal to minimum participants.',
      );
    }
  }

  private assertNonEmptyUpdate(input: UpdateActivityDto): void {
    if (Object.keys(input).length === 0) {
      throw invalidActivityOperation(
        'ACTIVITY_UPDATE_EMPTY',
        'At least one activity field must be supplied for update.',
      );
    }
  }

  private rethrowConflict(error: unknown): never {
    if (isUniqueConstraintError(error)) {
      throw activityConflict(
        'ACTIVITY_SLUG_EXISTS',
        'This provider already has an activity with this slug.',
      );
    }
    throw error;
  }
}

function requiredText(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw invalidActivityOperation('ACTIVITY_FIELD_INVALID', `${field} cannot be blank.`);
  }
  return normalized;
}

function optionalText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized;
}

function mergedText(value: string | null | undefined, existing: string | null): string | null {
  return value === undefined ? existing : optionalText(value);
}

function cityData(value: string | null): { city: string | null; normalizedCity: string | null } {
  const city = optionalText(value);
  return { city, normalizedCity: city === null ? null : normalizeLocation(city) };
}
