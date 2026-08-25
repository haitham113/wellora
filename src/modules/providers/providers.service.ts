import { Injectable } from '@nestjs/common';

import type { AuthPrincipal } from '../../common/auth/auth-principal.js';
import { paginationMeta } from '../../common/pagination/page-query.dto.js';
import {
  AccountStatus,
  OrganizationStatus,
  ProviderMembershipRole,
} from '../../generated/prisma/enums.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import {
  conflict,
  invalidOperation,
  isUniqueConstraintError,
  normalizeSlug,
  resourceNotFound,
} from '../organizations/organization-errors.js';
import type {
  AdminUpdateProviderDto,
  CreateProviderDto,
  ProviderListQueryDto,
  TenantUpdateProviderDto,
} from './dto/provider-request.dto.js';
import type { ProviderPageResponseDto, ProviderResponseDto } from './dto/provider-response.dto.js';
import { ProviderAuthorizationPolicy } from './provider-authorization.policy.js';

const providerSelect = {
  id: true,
  businessName: true,
  slug: true,
  description: true,
  status: true,
  country: true,
  timezone: true,
  contactEmail: true,
  contactPhone: true,
  websiteUrl: true,
  commissionRateBps: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class ProvidersService {
  constructor(
    private readonly database: PrismaService,
    private readonly authorization: ProviderAuthorizationPolicy,
  ) {}

  async create(input: CreateProviderDto): Promise<ProviderResponseDto> {
    this.assertTimeZone(input.timezone);
    try {
      const provider = await this.database.$transaction(async (transaction) => {
        const user = await transaction.user.findUnique({
          where: { id: input.initialAdminUserId },
          select: { status: true },
        });
        if (user === null) throw resourceNotFound('User');
        if (user.status !== AccountStatus.ACTIVE) {
          throw invalidOperation(
            'USER_NOT_ACTIVE',
            'Only an active account can be assigned access.',
          );
        }
        const created = await transaction.provider.create({
          data: {
            businessName: input.businessName.trim(),
            slug: input.slug,
            normalizedSlug: normalizeSlug(input.slug),
            country: input.country,
            timezone: input.timezone,
            commissionRateBps: input.commissionRateBps,
            ...(input.description === undefined ? {} : { description: input.description }),
            ...(input.contactEmail === undefined ? {} : { contactEmail: input.contactEmail }),
            ...(input.contactPhone === undefined ? {} : { contactPhone: input.contactPhone }),
            ...(input.websiteUrl === undefined ? {} : { websiteUrl: input.websiteUrl }),
          },
          select: providerSelect,
        });
        await transaction.providerMembership.create({
          data: {
            providerId: created.id,
            userId: input.initialAdminUserId,
            role: ProviderMembershipRole.ADMIN,
          },
        });
        return created;
      });
      return this.mapProvider(provider);
    } catch (error: unknown) {
      this.rethrowProviderConflict(error);
    }
  }

  async list(query: ProviderListQueryDto): Promise<ProviderPageResponseDto> {
    const search = query.search?.trim();
    const where = {
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.country === undefined ? {} : { country: query.country }),
      ...(search === undefined || search.length === 0
        ? {}
        : {
            OR: [
              { businessName: { contains: search, mode: 'insensitive' as const } },
              { slug: { contains: search, mode: 'insensitive' as const } },
              { contactEmail: { contains: search, mode: 'insensitive' as const } },
            ],
          }),
    };
    const [records, total] = await this.database.$transaction([
      this.database.provider.findMany({
        where,
        orderBy: [{ businessName: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: providerSelect,
      }),
      this.database.provider.count({ where }),
    ]);
    return {
      data: records.map((record) => this.mapProvider(record)),
      meta: paginationMeta(query.page, query.limit, total),
    };
  }

  getAdminDetail(providerId: string): Promise<ProviderResponseDto> {
    return this.getExistingProvider(providerId);
  }

  async updateAdmin(
    providerId: string,
    input: AdminUpdateProviderDto,
  ): Promise<ProviderResponseDto> {
    if (input.timezone !== undefined) this.assertTimeZone(input.timezone);
    return this.updateProviderRecord(providerId, input);
  }

  async setStatus(providerId: string, status: OrganizationStatus): Promise<ProviderResponseDto> {
    const existing = await this.database.provider.findUnique({
      where: { id: providerId },
      select: { id: true },
    });
    if (existing === null) throw resourceNotFound('Provider');
    const provider = await this.database.provider.update({
      where: { id: providerId },
      data: { status },
      select: providerSelect,
    });
    return this.mapProvider(provider);
  }

  async getScoped(principal: AuthPrincipal, providerId: string): Promise<ProviderResponseDto> {
    await this.authorization.authorize(principal, providerId, [
      ProviderMembershipRole.ADMIN,
      ProviderMembershipRole.STAFF,
    ]);
    return this.getExistingProvider(providerId);
  }

  async updateScoped(
    principal: AuthPrincipal,
    providerId: string,
    input: TenantUpdateProviderDto,
  ): Promise<ProviderResponseDto> {
    await this.authorization.authorize(principal, providerId, [ProviderMembershipRole.ADMIN]);
    if (input.timezone !== undefined) this.assertTimeZone(input.timezone);
    return this.updateProviderRecord(providerId, input);
  }

  private async updateProviderRecord(
    providerId: string,
    input: AdminUpdateProviderDto | TenantUpdateProviderDto,
  ): Promise<ProviderResponseDto> {
    const existing = await this.database.provider.findUnique({
      where: { id: providerId },
      select: { id: true },
    });
    if (existing === null) throw resourceNotFound('Provider');
    try {
      const provider = await this.database.provider.update({
        where: { id: providerId },
        data: {
          ...(input.businessName === undefined ? {} : { businessName: input.businessName.trim() }),
          ...(input.slug === undefined
            ? {}
            : { slug: input.slug, normalizedSlug: normalizeSlug(input.slug) }),
          ...(input.description === undefined ? {} : { description: input.description }),
          ...(input.country === undefined ? {} : { country: input.country }),
          ...(input.timezone === undefined ? {} : { timezone: input.timezone }),
          ...(input.contactEmail === undefined ? {} : { contactEmail: input.contactEmail }),
          ...(input.contactPhone === undefined ? {} : { contactPhone: input.contactPhone }),
          ...(input.websiteUrl === undefined ? {} : { websiteUrl: input.websiteUrl }),
          ...('commissionRateBps' in input ? { commissionRateBps: input.commissionRateBps } : {}),
        },
        select: providerSelect,
      });
      return this.mapProvider(provider);
    } catch (error: unknown) {
      this.rethrowProviderConflict(error);
    }
  }

  private async getExistingProvider(providerId: string): Promise<ProviderResponseDto> {
    const provider = await this.database.provider.findUnique({
      where: { id: providerId },
      select: providerSelect,
    });
    if (provider === null) throw resourceNotFound('Provider');
    return this.mapProvider(provider);
  }

  private assertTimeZone(timezone: string): void {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
    } catch {
      throw invalidOperation('INVALID_TIMEZONE', 'Timezone must be a valid IANA timezone.');
    }
  }

  private rethrowProviderConflict(error: unknown): never {
    if (isUniqueConstraintError(error)) {
      throw conflict('PROVIDER_SLUG_EXISTS', 'A provider with this slug already exists.');
    }
    throw error;
  }

  private mapProvider(record: {
    id: string;
    businessName: string;
    slug: string;
    description: string | null;
    status: OrganizationStatus;
    country: string;
    timezone: string;
    contactEmail: string | null;
    contactPhone: string | null;
    websiteUrl: string | null;
    commissionRateBps: number;
    createdAt: Date;
    updatedAt: Date;
  }): ProviderResponseDto {
    return {
      ...record,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
