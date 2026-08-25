import { Injectable } from '@nestjs/common';

import type { AuthPrincipal } from '../../common/auth/auth-principal.js';
import { paginationMeta } from '../../common/pagination/page-query.dto.js';
import {
  AccountStatus,
  EmployerMembershipRole,
  MembershipStatus,
} from '../../generated/prisma/enums.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import {
  conflict,
  invalidOperation,
  isUniqueConstraintError,
  resourceNotFound,
} from '../organizations/organization-errors.js';
import type { AddEmployerAdminDto, EmployerAdminListQueryDto } from './dto/employer-request.dto.js';
import type {
  EmployerAdminPageResponseDto,
  EmployerAdminResponseDto,
} from './dto/employer-response.dto.js';
import { EmployerAuthorizationPolicy } from './employer-authorization.policy.js';

@Injectable()
export class EmployerAdminsService {
  constructor(
    private readonly database: PrismaService,
    private readonly authorization: EmployerAuthorizationPolicy,
  ) {}

  async list(
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
    const [records, total] = await this.database.$transaction([
      this.database.employerMembership.findMany({
        where,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: { user: { select: { email: true } } },
      }),
      this.database.employerMembership.count({ where }),
    ]);
    return {
      data: records.map((record) => this.mapAdmin(record)),
      meta: paginationMeta(query.page, query.limit, total),
    };
  }

  async add(
    principal: AuthPrincipal,
    employerId: string,
    input: AddEmployerAdminDto,
  ): Promise<EmployerAdminResponseDto> {
    await this.authorization.authorize(principal, employerId, [EmployerMembershipRole.ADMIN]);
    try {
      const membership = await this.database.$transaction(async (transaction) => {
        const user = await transaction.user.findUnique({
          where: { id: input.userId },
          select: { status: true },
        });
        if (user === null) throw resourceNotFound('User');
        if (user.status !== AccountStatus.ACTIVE) {
          throw invalidOperation(
            'USER_NOT_ACTIVE',
            'Only an active account can be assigned access.',
          );
        }
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
      return this.mapAdmin(membership);
    } catch (error: unknown) {
      if (isUniqueConstraintError(error)) {
        throw conflict('EMPLOYER_MEMBERSHIP_EXISTS', 'The employer membership already exists.');
      }
      throw error;
    }
  }

  async deactivate(
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

  async activate(
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
    return this.mapAdmin(updated);
  }

  private mapAdmin(record: {
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
