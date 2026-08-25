import { Injectable } from '@nestjs/common';

import type { AuthPrincipal } from '../../common/auth/auth-principal.js';
import { paginationMeta } from '../../common/pagination/page-query.dto.js';
import {
  AccountStatus,
  EmployerMembershipRole,
  OrganizationStatus,
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
  AdminUpdateEmployerDto,
  CreateEmployerDto,
  EmployerListQueryDto,
  TenantUpdateEmployerDto,
  UpdateEmployerSettingsDto,
} from './dto/employer-request.dto.js';
import type {
  EmployerPageResponseDto,
  EmployerResponseDto,
  EmployerSettingsResponseDto,
} from './dto/employer-response.dto.js';
import { EmployerAuthorizationPolicy } from './employer-authorization.policy.js';

const employerSelect = {
  id: true,
  name: true,
  slug: true,
  status: true,
  country: true,
  timezone: true,
  defaultCurrency: true,
  contactEmail: true,
  contactPhone: true,
  websiteUrl: true,
  createdAt: true,
  updatedAt: true,
} as const;

type EmployerRecordDatabase = Pick<PrismaService, 'employer'>;

@Injectable()
export class EmployersService {
  constructor(
    private readonly database: PrismaService,
    private readonly authorization: EmployerAuthorizationPolicy,
  ) {}

  async create(input: CreateEmployerDto): Promise<EmployerResponseDto> {
    this.assertTimeZone(input.timezone);
    try {
      const employer = await this.database.$transaction(async (transaction) => {
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
        const created = await transaction.employer.create({
          data: {
            name: input.name.trim(),
            slug: input.slug,
            normalizedSlug: normalizeSlug(input.slug),
            country: input.country,
            timezone: input.timezone,
            defaultCurrency: input.defaultCurrency,
            ...(input.contactEmail === undefined ? {} : { contactEmail: input.contactEmail }),
            ...(input.contactPhone === undefined ? {} : { contactPhone: input.contactPhone }),
            ...(input.websiteUrl === undefined ? {} : { websiteUrl: input.websiteUrl }),
          },
          select: employerSelect,
        });
        await transaction.employerMembership.create({
          data: {
            employerId: created.id,
            userId: input.initialAdminUserId,
            role: EmployerMembershipRole.ADMIN,
          },
        });
        return created;
      });
      return this.mapEmployer(employer);
    } catch (error: unknown) {
      this.rethrowEmployerConflict(error);
    }
  }

  async list(query: EmployerListQueryDto): Promise<EmployerPageResponseDto> {
    const search = query.search?.trim();
    const where = {
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.country === undefined ? {} : { country: query.country }),
      ...(search === undefined || search.length === 0
        ? {}
        : {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { slug: { contains: search, mode: 'insensitive' as const } },
              { contactEmail: { contains: search, mode: 'insensitive' as const } },
            ],
          }),
    };
    const [records, total] = await this.database.$transaction([
      this.database.employer.findMany({
        where,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: employerSelect,
      }),
      this.database.employer.count({ where }),
    ]);
    return {
      data: records.map((record) => this.mapEmployer(record)),
      meta: paginationMeta(query.page, query.limit, total),
    };
  }

  getAdminDetail(employerId: string): Promise<EmployerResponseDto> {
    return this.getExistingEmployer(employerId);
  }

  async updateAdmin(
    employerId: string,
    input: AdminUpdateEmployerDto,
  ): Promise<EmployerResponseDto> {
    if (input.timezone !== undefined) this.assertTimeZone(input.timezone);
    return this.updateEmployerRecord(employerId, input);
  }

  async setStatus(employerId: string, status: OrganizationStatus): Promise<EmployerResponseDto> {
    const existing = await this.database.employer.findUnique({
      where: { id: employerId },
      select: { id: true },
    });
    if (existing === null) throw resourceNotFound('Employer');
    const employer = await this.database.employer.update({
      where: { id: employerId },
      data: { status },
      select: employerSelect,
    });
    return this.mapEmployer(employer);
  }

  async getScoped(principal: AuthPrincipal, employerId: string): Promise<EmployerResponseDto> {
    await this.authorization.authorize(principal, employerId, [
      EmployerMembershipRole.ADMIN,
      EmployerMembershipRole.EMPLOYEE,
    ]);
    return this.getExistingEmployer(employerId);
  }

  async updateScoped(
    principal: AuthPrincipal,
    employerId: string,
    input: TenantUpdateEmployerDto,
  ): Promise<EmployerResponseDto> {
    return this.database.$transaction(async (transaction) => {
      await this.authorization.authorize(
        principal,
        employerId,
        [EmployerMembershipRole.ADMIN],
        transaction,
      );
      return this.updateEmployerRecord(employerId, input, transaction);
    });
  }

  async getSettings(
    principal: AuthPrincipal,
    employerId: string,
  ): Promise<EmployerSettingsResponseDto> {
    await this.authorization.authorize(principal, employerId, [EmployerMembershipRole.ADMIN]);
    const employer = await this.database.employer.findUnique({
      where: { id: employerId },
      select: {
        id: true,
        timezone: true,
        defaultCurrency: true,
        contactEmail: true,
        contactPhone: true,
        websiteUrl: true,
      },
    });
    if (employer === null) throw resourceNotFound('Employer');
    return this.mapSettings(employer);
  }

  async updateSettings(
    principal: AuthPrincipal,
    employerId: string,
    input: UpdateEmployerSettingsDto,
  ): Promise<EmployerSettingsResponseDto> {
    if (input.timezone !== undefined) this.assertTimeZone(input.timezone);
    const employer = await this.database.$transaction(async (transaction) => {
      await this.authorization.authorize(
        principal,
        employerId,
        [EmployerMembershipRole.ADMIN],
        transaction,
      );
      return transaction.employer.update({
        where: { id: employerId },
        data: input,
        select: {
          id: true,
          timezone: true,
          defaultCurrency: true,
          contactEmail: true,
          contactPhone: true,
          websiteUrl: true,
        },
      });
    });
    return this.mapSettings(employer);
  }

  private async getExistingEmployer(employerId: string): Promise<EmployerResponseDto> {
    const employer = await this.database.employer.findUnique({
      where: { id: employerId },
      select: employerSelect,
    });
    if (employer === null) throw resourceNotFound('Employer');
    return this.mapEmployer(employer);
  }

  private async updateEmployerRecord(
    employerId: string,
    input: AdminUpdateEmployerDto | TenantUpdateEmployerDto,
    database: EmployerRecordDatabase = this.database,
  ): Promise<EmployerResponseDto> {
    const existing = await database.employer.findUnique({
      where: { id: employerId },
      select: { id: true },
    });
    if (existing === null) throw resourceNotFound('Employer');
    try {
      const employer = await database.employer.update({
        where: { id: employerId },
        data: {
          ...(input.name === undefined ? {} : { name: input.name.trim() }),
          ...(input.slug === undefined
            ? {}
            : { slug: input.slug, normalizedSlug: normalizeSlug(input.slug) }),
          ...(input.country === undefined ? {} : { country: input.country }),
          ...('timezone' in input ? { timezone: input.timezone } : {}),
          ...('defaultCurrency' in input ? { defaultCurrency: input.defaultCurrency } : {}),
          ...('contactEmail' in input ? { contactEmail: input.contactEmail } : {}),
          ...('contactPhone' in input ? { contactPhone: input.contactPhone } : {}),
          ...('websiteUrl' in input ? { websiteUrl: input.websiteUrl } : {}),
        },
        select: employerSelect,
      });
      return this.mapEmployer(employer);
    } catch (error: unknown) {
      this.rethrowEmployerConflict(error);
    }
  }

  private assertTimeZone(timezone: string): void {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
    } catch {
      throw invalidOperation('INVALID_TIMEZONE', 'Timezone must be a valid IANA timezone.');
    }
  }

  private rethrowEmployerConflict(error: unknown): never {
    if (isUniqueConstraintError(error)) {
      throw conflict('EMPLOYER_SLUG_EXISTS', 'An employer with this slug already exists.');
    }
    throw error;
  }

  private mapEmployer(record: {
    id: string;
    name: string;
    slug: string;
    status: OrganizationStatus;
    country: string;
    timezone: string;
    defaultCurrency: string;
    contactEmail: string | null;
    contactPhone: string | null;
    websiteUrl: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): EmployerResponseDto {
    return {
      ...record,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private mapSettings(record: {
    id: string;
    timezone: string;
    defaultCurrency: string;
    contactEmail: string | null;
    contactPhone: string | null;
    websiteUrl: string | null;
  }): EmployerSettingsResponseDto {
    return {
      employerId: record.id,
      timezone: record.timezone,
      defaultCurrency: record.defaultCurrency,
      contactEmail: record.contactEmail,
      contactPhone: record.contactPhone,
      websiteUrl: record.websiteUrl,
    };
  }
}
