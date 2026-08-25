import { Injectable } from '@nestjs/common';

import type { AuthPrincipal } from '../../common/auth/auth-principal.js';
import { paginationMeta } from '../../common/pagination/page-query.dto.js';
import {
  AccountStatus,
  EmployeeStatus,
  EmployerMembershipRole,
  MembershipStatus,
} from '../../generated/prisma/enums.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { normalizeEmail } from '../auth/credentials.service.js';
import {
  authorizationDenied,
  conflict,
  invalidOperation,
  isUniqueConstraintError,
  resourceNotFound,
} from '../organizations/organization-errors.js';
import type {
  CreateEmployeeDto,
  EmployeeListQueryDto,
  UpdateEmployeeDto,
} from './dto/employer-request.dto.js';
import type { EmployeePageResponseDto, EmployeeResponseDto } from './dto/employer-response.dto.js';
import { EmployerAuthorizationPolicy } from './employer-authorization.policy.js';

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
export class EmployeesService {
  constructor(
    private readonly database: PrismaService,
    private readonly authorization: EmployerAuthorizationPolicy,
  ) {}

  async list(
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

  async create(
    principal: AuthPrincipal,
    employerId: string,
    input: CreateEmployeeDto,
  ): Promise<EmployeeResponseDto> {
    const normalizedEmail = normalizeEmail(input.email);
    try {
      const employee = await this.database.$transaction(async (transaction) => {
        const auth = await this.authorization.authorize(
          principal,
          employerId,
          [EmployerMembershipRole.ADMIN],
          transaction,
        );
        if (input.userId !== undefined) {
          if (!auth.isPlatformAdmin) throw authorizationDenied();
          const user = await transaction.user.findUnique({
            where: { id: input.userId },
            select: { status: true, normalizedEmail: true },
          });
          if (user === null) throw resourceNotFound('User');
          if (user.status !== AccountStatus.ACTIVE) {
            throw invalidOperation(
              'USER_NOT_ACTIVE',
              'Only an active account can be assigned access.',
            );
          }
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

  async get(
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

  async update(
    principal: AuthPrincipal,
    employerId: string,
    employeeId: string,
    input: UpdateEmployeeDto,
  ): Promise<EmployeeResponseDto> {
    try {
      const employee = await this.database.$transaction(async (transaction) => {
        await this.authorization.authorize(
          principal,
          employerId,
          [EmployerMembershipRole.ADMIN],
          transaction,
        );
        const existing = await transaction.employee.findFirst({
          where: { id: employeeId, employerId },
          select: { id: true },
        });
        if (existing === null) throw resourceNotFound('Employee');
        return transaction.employee.update({
          where: { id: existing.id, employerId },
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

  async setStatus(
    principal: AuthPrincipal,
    employerId: string,
    employeeId: string,
    status: EmployeeStatus,
  ): Promise<EmployeeResponseDto> {
    const employee = await this.database.$transaction(async (transaction) => {
      await this.authorization.authorize(
        principal,
        employerId,
        [EmployerMembershipRole.ADMIN],
        transaction,
      );
      const existing = await transaction.employee.findFirst({
        where: { id: employeeId, employerId },
        select: { id: true, userId: true },
      });
      if (existing === null) throw resourceNotFound('Employee');
      const updated = await transaction.employee.update({
        where: { id: existing.id, employerId },
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
}
