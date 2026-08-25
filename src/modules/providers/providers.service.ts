import { Injectable } from '@nestjs/common';

import type { AuthPrincipal } from '../../common/auth/auth-principal.js';
import { paginationMeta } from '../../common/pagination/page-query.dto.js';
import {
  AccountStatus,
  MembershipStatus,
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
  AddProviderMemberDto,
  AdminUpdateProviderDto,
  CreateProviderDto,
  ProviderListQueryDto,
  ProviderMemberListQueryDto,
  TenantUpdateProviderDto,
  UpdateProviderMemberDto,
} from './dto/provider-request.dto.js';
import type {
  ProviderMemberPageResponseDto,
  ProviderMemberResponseDto,
  ProviderPageResponseDto,
  ProviderResponseDto,
} from './dto/provider-response.dto.js';
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

const memberInclude = { user: { select: { email: true } } } as const;

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
        await this.assertAssignableUser(transaction, input.initialAdminUserId);
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

  async getAdminDetail(providerId: string): Promise<ProviderResponseDto> {
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

  async listMembers(
    principal: AuthPrincipal,
    providerId: string,
    query: ProviderMemberListQueryDto,
  ): Promise<ProviderMemberPageResponseDto> {
    await this.authorization.authorize(principal, providerId, [ProviderMembershipRole.ADMIN]);
    const search = query.search?.trim();
    const where = {
      providerId,
      ...(query.role === undefined ? {} : { role: query.role }),
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(search === undefined || search.length === 0
        ? {}
        : { user: { email: { contains: search, mode: 'insensitive' as const } } }),
    };
    const [records, total] = await this.database.$transaction([
      this.database.providerMembership.findMany({
        where,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: memberInclude,
      }),
      this.database.providerMembership.count({ where }),
    ]);
    return {
      data: records.map((record) => this.mapMember(record)),
      meta: paginationMeta(query.page, query.limit, total),
    };
  }

  async addMember(
    principal: AuthPrincipal,
    providerId: string,
    input: AddProviderMemberDto,
  ): Promise<ProviderMemberResponseDto> {
    await this.authorization.authorize(principal, providerId, [ProviderMembershipRole.ADMIN]);
    try {
      const member = await this.database.$transaction(async (transaction) => {
        await this.assertAssignableUser(transaction, input.userId);
        const existing = await transaction.providerMembership.findUnique({
          where: { providerId_userId: { providerId, userId: input.userId } },
        });
        return existing === null
          ? transaction.providerMembership.create({
              data: { providerId, userId: input.userId, role: input.role },
              include: memberInclude,
            })
          : transaction.providerMembership.update({
              where: { id: existing.id },
              data: { role: input.role, status: MembershipStatus.ACTIVE },
              include: memberInclude,
            });
      });
      return this.mapMember(member);
    } catch (error: unknown) {
      if (isUniqueConstraintError(error)) {
        throw conflict('PROVIDER_MEMBERSHIP_EXISTS', 'The provider membership already exists.');
      }
      throw error;
    }
  }

  async updateMember(
    principal: AuthPrincipal,
    providerId: string,
    membershipId: string,
    input: UpdateProviderMemberDto,
  ): Promise<ProviderMemberResponseDto> {
    const auth = await this.authorization.authorize(principal, providerId, [
      ProviderMembershipRole.ADMIN,
    ]);
    const member = await this.database.$transaction(async (transaction) => {
      const existing = await transaction.providerMembership.findFirst({
        where: { id: membershipId, providerId },
      });
      if (existing === null) throw resourceNotFound('Membership');
      if (
        !auth.isPlatformAdmin &&
        existing.role === ProviderMembershipRole.ADMIN &&
        input.role !== ProviderMembershipRole.ADMIN &&
        existing.status === MembershipStatus.ACTIVE
      ) {
        await this.assertAnotherActiveAdmin(transaction, providerId, existing.id);
      }
      return transaction.providerMembership.update({
        where: { id: existing.id },
        data: { role: input.role },
        include: memberInclude,
      });
    });
    return this.mapMember(member);
  }

  async deactivateMember(
    principal: AuthPrincipal,
    providerId: string,
    membershipId: string,
  ): Promise<void> {
    const auth = await this.authorization.authorize(principal, providerId, [
      ProviderMembershipRole.ADMIN,
    ]);
    await this.database.$transaction(async (transaction) => {
      const existing = await transaction.providerMembership.findFirst({
        where: { id: membershipId, providerId },
      });
      if (existing === null) throw resourceNotFound('Membership');
      if (
        !auth.isPlatformAdmin &&
        existing.role === ProviderMembershipRole.ADMIN &&
        existing.status === MembershipStatus.ACTIVE
      ) {
        await this.assertAnotherActiveAdmin(transaction, providerId, existing.id);
      }
      await transaction.providerMembership.update({
        where: { id: existing.id },
        data: { status: MembershipStatus.INACTIVE },
      });
    });
  }

  async activateMember(
    principal: AuthPrincipal,
    providerId: string,
    membershipId: string,
  ): Promise<ProviderMemberResponseDto> {
    await this.authorization.authorize(principal, providerId, [ProviderMembershipRole.ADMIN]);
    const existing = await this.database.providerMembership.findFirst({
      where: { id: membershipId, providerId },
      include: { user: { select: { status: true } } },
    });
    if (existing === null) throw resourceNotFound('Membership');
    if (existing.user.status !== AccountStatus.ACTIVE) {
      throw invalidOperation('USER_NOT_ACTIVE', 'Only an active account can be assigned access.');
    }
    const updated = await this.database.providerMembership.update({
      where: { id: existing.id },
      data: { status: MembershipStatus.ACTIVE },
      include: memberInclude,
    });
    return this.mapMember(updated);
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

  private async assertAssignableUser(
    database: Pick<PrismaService, 'user'>,
    userId: string,
  ): Promise<void> {
    const user = await database.user.findUnique({
      where: { id: userId },
      select: { status: true },
    });
    if (user === null) throw resourceNotFound('User');
    if (user.status !== AccountStatus.ACTIVE) {
      throw invalidOperation('USER_NOT_ACTIVE', 'Only an active account can be assigned access.');
    }
  }

  private async assertAnotherActiveAdmin(
    database: Pick<PrismaService, 'providerMembership'>,
    providerId: string,
    membershipId: string,
  ): Promise<void> {
    const otherAdmins = await database.providerMembership.count({
      where: {
        providerId,
        id: { not: membershipId },
        role: ProviderMembershipRole.ADMIN,
        status: MembershipStatus.ACTIVE,
      },
    });
    if (otherAdmins === 0) {
      throw conflict(
        'LAST_PROVIDER_ADMIN',
        'The last active provider administrator cannot be changed or deactivated.',
      );
    }
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

  private mapMember(record: {
    id: string;
    userId: string;
    role: ProviderMembershipRole;
    status: MembershipStatus;
    createdAt: Date;
    user: { email: string };
  }): ProviderMemberResponseDto {
    return {
      id: record.id,
      userId: record.userId,
      email: record.user.email,
      role: record.role,
      status: record.status,
      createdAt: record.createdAt.toISOString(),
    };
  }
}
