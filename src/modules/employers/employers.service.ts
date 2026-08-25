import { Injectable } from '@nestjs/common';

import type { AuthPrincipal } from '../../common/auth/auth-principal.js';
import { paginationMeta } from '../../common/pagination/page-query.dto.js';
import {
  AccountStatus,
  EmployeeStatus,
  EmployerMembershipRole,
  MembershipStatus,
  OrganizationStatus,
} from '../../generated/prisma/enums.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { normalizeEmail } from '../auth/credentials.service.js';
import {
  conflict,
  invalidOperation,
  isUniqueConstraintError,
  normalizeSlug,
  resourceNotFound,
} from '../organizations/organization-errors.js';
import type {
  AddEmployerAdminDto,
  AdminUpdateEmployerDto,
  CreateEmployeeDto,
  CreateEmployerDto,
  EmployeeListQueryDto,
  EmployerAdminListQueryDto,
  EmployerListQueryDto,
  TenantUpdateEmployerDto,
  UpdateEmployeeDto,
  UpdateEmployerSettingsDto,
} from './dto/employer-request.dto.js';
import type {
  EmployeePageResponseDto,
  EmployeeResponseDto,
  EmployerAdminPageResponseDto,
  EmployerAdminResponseDto,
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

const employeeSelect = {
  id: true,
  employerId: true,
  userId: true,
  email: true,
  firstName: true,
  lastName: true,
  employeeNumber: true,
  department: true,
  jobTitle: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

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
        await this.assertAssignableUser(transaction, input.initialAdminUserId);
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

  async getAdminDetail(employerId: string): Promise<EmployerResponseDto> {
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
    await this.authorization.authorize(principal, employerId, [EmployerMembershipRole.ADMIN]);
    return this.updateEmployerRecord(employerId, input);
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
    return {
      employerId: employer.id,
      timezone: employer.timezone,
      defaultCurrency: employer.defaultCurrency,
      contactEmail: employer.contactEmail,
      contactPhone: employer.contactPhone,
      websiteUrl: employer.websiteUrl,
    };
  }

  async updateSettings(
    principal: AuthPrincipal,
    employerId: string,
    input: UpdateEmployerSettingsDto,
  ): Promise<EmployerSettingsResponseDto> {
    await this.authorization.authorize(principal, employerId, [EmployerMembershipRole.ADMIN]);
    if (input.timezone !== undefined) this.assertTimeZone(input.timezone);
    const employer = await this.database.employer.update({
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
    return {
      employerId: employer.id,
      timezone: employer.timezone,
      defaultCurrency: employer.defaultCurrency,
      contactEmail: employer.contactEmail,
      contactPhone: employer.contactPhone,
      websiteUrl: employer.websiteUrl,
    };
  }

  async listAdmins(
    principal: AuthPrincipal,
    employerId: string,
    query: EmployerAdminListQueryDto,
  ): Promise<EmployerAdminPageResponseDto> {
    await this.authorization.authorize(principal, employerId, [EmployerMembershipRole.ADMIN]);
    const search = query.search?.trim();
    const where = {
      employerId,
      role: EmployerMembershipRole.ADMIN,
      ...(search === undefined || search.length === 0
        ? {}
        : { user: { email: { contains: search, mode: 'insensitive' as const } } }),
    };
    const select = {
      id: true,
      userId: true,
      role: true,
      status: true,
      createdAt: true,
      user: { select: { email: true } },
    } as const;
    const [records, total] = await this.database.$transaction([
      this.database.employerMembership.findMany({
        where,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select,
      }),
      this.database.employerMembership.count({ where }),
    ]);
    return {
      data: records.map((record) => this.mapEmployerAdmin(record)),
      meta: paginationMeta(query.page, query.limit, total),
    };
  }

  async addAdmin(
    principal: AuthPrincipal,
    employerId: string,
    input: AddEmployerAdminDto,
  ): Promise<EmployerAdminResponseDto> {
    await this.authorization.authorize(principal, employerId, [EmployerMembershipRole.ADMIN]);
    try {
      const membership = await this.database.$transaction(async (transaction) => {
        await this.assertAssignableUser(transaction, input.userId);
        const existing = await transaction.employerMembership.findUnique({
          where: { employerId_userId: { employerId, userId: input.userId } },
        });
        if (existing?.role === EmployerMembershipRole.EMPLOYEE) {
          throw conflict(
            'EMPLOYER_MEMBERSHIP_ROLE_CONFLICT',
            'The account already has a different role in this employer.',
          );
        }
        return existing === null
          ? transaction.employerMembership.create({
              data: { employerId, userId: input.userId, role: EmployerMembershipRole.ADMIN },
              include: { user: { select: { email: true } } },
            })
          : transaction.employerMembership.update({
              where: { id: existing.id },
              data: { status: MembershipStatus.ACTIVE },
              include: { user: { select: { email: true } } },
            });
      });
      return this.mapEmployerAdmin(membership);
    } catch (error: unknown) {
      if (isUniqueConstraintError(error)) {
        throw conflict('EMPLOYER_MEMBERSHIP_EXISTS', 'The employer membership already exists.');
      }
      throw error;
    }
  }

  async deactivateAdmin(
    principal: AuthPrincipal,
    employerId: string,
    membershipId: string,
  ): Promise<void> {
    const auth = await this.authorization.authorize(principal, employerId, [
      EmployerMembershipRole.ADMIN,
    ]);
    await this.database.$transaction(async (transaction) => {
      const membership = await transaction.employerMembership.findFirst({
        where: { id: membershipId, employerId, role: EmployerMembershipRole.ADMIN },
      });
      if (membership === null) throw resourceNotFound('Membership');
      if (!auth.isPlatformAdmin && membership.status === MembershipStatus.ACTIVE) {
        const activeAdmins = await transaction.employerMembership.count({
          where: {
            employerId,
            role: EmployerMembershipRole.ADMIN,
            status: MembershipStatus.ACTIVE,
          },
        });
        if (activeAdmins <= 1) {
          throw conflict(
            'LAST_EMPLOYER_ADMIN',
            'The last active employer administrator cannot be deactivated.',
          );
        }
      }
      await transaction.employerMembership.update({
        where: { id: membership.id },
        data: { status: MembershipStatus.INACTIVE },
      });
    });
  }

  async activateAdmin(
    principal: AuthPrincipal,
    employerId: string,
    membershipId: string,
  ): Promise<EmployerAdminResponseDto> {
    await this.authorization.authorize(principal, employerId, [EmployerMembershipRole.ADMIN]);
    const membership = await this.database.employerMembership.findFirst({
      where: { id: membershipId, employerId, role: EmployerMembershipRole.ADMIN },
      include: { user: { select: { email: true, status: true } } },
    });
    if (membership === null) throw resourceNotFound('Membership');
    if (membership.user.status !== AccountStatus.ACTIVE) {
      throw invalidOperation('USER_NOT_ACTIVE', 'Only an active account can be assigned access.');
    }
    const updated = await this.database.employerMembership.update({
      where: { id: membership.id },
      data: { status: MembershipStatus.ACTIVE },
      include: { user: { select: { email: true } } },
    });
    return this.mapEmployerAdmin(updated);
  }

  async listEmployees(
    principal: AuthPrincipal,
    employerId: string,
    query: EmployeeListQueryDto,
  ): Promise<EmployeePageResponseDto> {
    await this.authorization.authorize(principal, employerId, [EmployerMembershipRole.ADMIN]);
    const search = query.search?.trim();
    const where = {
      employerId,
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.department === undefined
        ? {}
        : { department: { equals: query.department, mode: 'insensitive' as const } }),
      ...(search === undefined || search.length === 0
        ? {}
        : {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' as const } },
              { lastName: { contains: search, mode: 'insensitive' as const } },
              { email: { contains: search, mode: 'insensitive' as const } },
              { employeeNumber: { contains: search, mode: 'insensitive' as const } },
            ],
          }),
    };
    const [records, total] = await this.database.$transaction([
      this.database.employee.findMany({
        where,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: employeeSelect,
      }),
      this.database.employee.count({ where }),
    ]);
    return {
      data: records.map((record) => this.mapEmployee(record)),
      meta: paginationMeta(query.page, query.limit, total),
    };
  }

  async createEmployee(
    principal: AuthPrincipal,
    employerId: string,
    input: CreateEmployeeDto,
  ): Promise<EmployeeResponseDto> {
    await this.authorization.authorize(principal, employerId, [EmployerMembershipRole.ADMIN]);
    const normalizedEmail = normalizeEmail(input.email);
    try {
      const employee = await this.database.$transaction(async (transaction) => {
        if (input.userId !== undefined) {
          const user = await this.assertAssignableUser(transaction, input.userId);
          if (user.normalizedEmail !== normalizedEmail) {
            throw invalidOperation(
              'EMPLOYEE_USER_EMAIL_MISMATCH',
              'The employee email must match the linked account email.',
            );
          }
          const membership = await transaction.employerMembership.findUnique({
            where: { employerId_userId: { employerId, userId: input.userId } },
          });
          if (membership !== null) {
            throw conflict(
              'EMPLOYER_MEMBERSHIP_EXISTS',
              'The linked account already belongs to this employer.',
            );
          }
        }

        const created = await transaction.employee.create({
          data: {
            employerId,
            email: input.email.trim(),
            normalizedEmail,
            firstName: input.firstName.trim(),
            lastName: input.lastName.trim(),
            ...(input.userId === undefined ? {} : { userId: input.userId }),
            ...(input.employeeNumber === undefined ? {} : { employeeNumber: input.employeeNumber }),
            ...(input.department === undefined ? {} : { department: input.department }),
            ...(input.jobTitle === undefined ? {} : { jobTitle: input.jobTitle }),
          },
          select: employeeSelect,
        });
        if (input.userId !== undefined) {
          await transaction.employerMembership.create({
            data: {
              employerId,
              userId: input.userId,
              role: EmployerMembershipRole.EMPLOYEE,
            },
          });
        }
        return created;
      });
      return this.mapEmployee(employee);
    } catch (error: unknown) {
      if (isUniqueConstraintError(error)) {
        throw conflict(
          'EMPLOYEE_ALREADY_EXISTS',
          'An employee with the same email, account, or employee number already exists.',
        );
      }
      throw error;
    }
  }

  async getEmployee(
    principal: AuthPrincipal,
    employerId: string,
    employeeId: string,
  ): Promise<EmployeeResponseDto> {
    const auth = await this.authorization.authorize(principal, employerId, [
      EmployerMembershipRole.ADMIN,
      EmployerMembershipRole.EMPLOYEE,
    ]);
    const employee = await this.database.employee.findFirst({
      where: {
        id: employeeId,
        employerId,
        ...(!auth.isPlatformAdmin && auth.role === EmployerMembershipRole.EMPLOYEE
          ? { userId: principal.userId }
          : {}),
      },
      select: employeeSelect,
    });
    if (employee === null) throw resourceNotFound('Employee');
    return this.mapEmployee(employee);
  }

  async updateEmployee(
    principal: AuthPrincipal,
    employerId: string,
    employeeId: string,
    input: UpdateEmployeeDto,
  ): Promise<EmployeeResponseDto> {
    await this.authorization.authorize(principal, employerId, [EmployerMembershipRole.ADMIN]);
    const existing = await this.database.employee.findFirst({
      where: { id: employeeId, employerId },
      select: { id: true },
    });
    if (existing === null) throw resourceNotFound('Employee');
    try {
      const employee = await this.database.employee.update({
        where: { id: existing.id },
        data: {
          ...(input.email === undefined
            ? {}
            : { email: input.email.trim(), normalizedEmail: normalizeEmail(input.email) }),
          ...(input.firstName === undefined ? {} : { firstName: input.firstName.trim() }),
          ...(input.lastName === undefined ? {} : { lastName: input.lastName.trim() }),
          ...(input.employeeNumber === undefined ? {} : { employeeNumber: input.employeeNumber }),
          ...(input.department === undefined ? {} : { department: input.department }),
          ...(input.jobTitle === undefined ? {} : { jobTitle: input.jobTitle }),
        },
        select: employeeSelect,
      });
      return this.mapEmployee(employee);
    } catch (error: unknown) {
      if (isUniqueConstraintError(error)) {
        throw conflict(
          'EMPLOYEE_ALREADY_EXISTS',
          'An employee with the same email or employee number already exists.',
        );
      }
      throw error;
    }
  }

  async setEmployeeStatus(
    principal: AuthPrincipal,
    employerId: string,
    employeeId: string,
    status: EmployeeStatus,
  ): Promise<EmployeeResponseDto> {
    await this.authorization.authorize(principal, employerId, [EmployerMembershipRole.ADMIN]);
    const employee = await this.database.$transaction(async (transaction) => {
      const existing = await transaction.employee.findFirst({
        where: { id: employeeId, employerId },
        select: { id: true, userId: true },
      });
      if (existing === null) throw resourceNotFound('Employee');
      const updated = await transaction.employee.update({
        where: { id: existing.id },
        data: { status },
        select: employeeSelect,
      });
      if (existing.userId !== null) {
        await transaction.employerMembership.updateMany({
          where: {
            employerId,
            userId: existing.userId,
            role: EmployerMembershipRole.EMPLOYEE,
          },
          data: {
            status:
              status === EmployeeStatus.ACTIVE
                ? MembershipStatus.ACTIVE
                : MembershipStatus.INACTIVE,
          },
        });
      }
      return updated;
    });
    return this.mapEmployee(employee);
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
  ): Promise<EmployerResponseDto> {
    const existing = await this.database.employer.findUnique({
      where: { id: employerId },
      select: { id: true },
    });
    if (existing === null) throw resourceNotFound('Employer');
    try {
      const employer = await this.database.employer.update({
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

  private async assertAssignableUser(
    database: Pick<PrismaService, 'user'>,
    userId: string,
  ): Promise<{ normalizedEmail: string }> {
    const user = await database.user.findUnique({
      where: { id: userId },
      select: { status: true, normalizedEmail: true },
    });
    if (user === null) throw resourceNotFound('User');
    if (user.status !== AccountStatus.ACTIVE) {
      throw invalidOperation('USER_NOT_ACTIVE', 'Only an active account can be assigned access.');
    }
    return user;
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

  private mapEmployee(record: {
    id: string;
    employerId: string;
    userId: string | null;
    email: string;
    firstName: string;
    lastName: string;
    employeeNumber: string | null;
    department: string | null;
    jobTitle: string | null;
    status: EmployeeStatus;
    createdAt: Date;
    updatedAt: Date;
  }): EmployeeResponseDto {
    return {
      ...record,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private mapEmployerAdmin(record: {
    id: string;
    userId: string;
    role: EmployerMembershipRole;
    status: MembershipStatus;
    createdAt: Date;
    user: { email: string };
  }): EmployerAdminResponseDto {
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
