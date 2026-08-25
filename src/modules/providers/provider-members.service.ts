import { Injectable } from '@nestjs/common';

import type { AuthPrincipal } from '../../common/auth/auth-principal.js';
import { paginationMeta } from '../../common/pagination/page-query.dto.js';
import {
  AccountStatus,
  MembershipStatus,
  ProviderMembershipRole,
} from '../../generated/prisma/enums.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import {
  authorizationDenied,
  conflict,
  invalidOperation,
  isUniqueConstraintError,
  resourceNotFound,
} from '../organizations/organization-errors.js';
import type {
  AddProviderMemberDto,
  ProviderMemberListQueryDto,
  UpdateProviderMemberDto,
} from './dto/provider-request.dto.js';
import type {
  ProviderMemberPageResponseDto,
  ProviderMemberResponseDto,
} from './dto/provider-response.dto.js';
import { ProviderAuthorizationPolicy } from './provider-authorization.policy.js';

const memberInclude = { user: { select: { email: true } } } as const;

@Injectable()
export class ProviderMembersService {
  constructor(
    private readonly database: PrismaService,
    private readonly authorization: ProviderAuthorizationPolicy,
  ) {}

  async list(
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

  async add(
    principal: AuthPrincipal,
    providerId: string,
    input: AddProviderMemberDto,
  ): Promise<ProviderMemberResponseDto> {
    try {
      const member = await this.database.$transaction(async (transaction) => {
        const auth = await this.authorization.authorize(
          principal,
          providerId,
          [ProviderMembershipRole.ADMIN],
          transaction,
        );
        const existing = await transaction.providerMembership.findUnique({
          where: { providerId_userId: { providerId, userId: input.userId } },
          include: { user: { select: { status: true } } },
        });
        if (existing !== null) {
          if (existing.user.status !== AccountStatus.ACTIVE) {
            throw invalidOperation(
              'USER_NOT_ACTIVE',
              'Only an active account can be assigned access.',
            );
          }
          return transaction.providerMembership.update({
            where: { id: existing.id, providerId },
            data: { role: input.role, status: MembershipStatus.ACTIVE },
            include: memberInclude,
          });
        }
        if (!auth.isPlatformAdmin) throw authorizationDenied();

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
        return transaction.providerMembership.create({
          data: { providerId, userId: input.userId, role: input.role },
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

  async update(
    principal: AuthPrincipal,
    providerId: string,
    membershipId: string,
    input: UpdateProviderMemberDto,
  ): Promise<ProviderMemberResponseDto> {
    const member = await this.database.$transaction(async (transaction) => {
      const auth = await this.authorization.authorize(
        principal,
        providerId,
        [ProviderMembershipRole.ADMIN],
        transaction,
      );
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
        where: { id: existing.id, providerId },
        data: { role: input.role },
        include: memberInclude,
      });
    });
    return this.mapMember(member);
  }

  async deactivate(
    principal: AuthPrincipal,
    providerId: string,
    membershipId: string,
  ): Promise<void> {
    await this.database.$transaction(async (transaction) => {
      const auth = await this.authorization.authorize(
        principal,
        providerId,
        [ProviderMembershipRole.ADMIN],
        transaction,
      );
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
        where: { id: existing.id, providerId },
        data: { status: MembershipStatus.INACTIVE },
      });
    });
  }

  async activate(
    principal: AuthPrincipal,
    providerId: string,
    membershipId: string,
  ): Promise<ProviderMemberResponseDto> {
    const updated = await this.database.$transaction(async (transaction) => {
      await this.authorization.authorize(
        principal,
        providerId,
        [ProviderMembershipRole.ADMIN],
        transaction,
      );
      const existing = await transaction.providerMembership.findFirst({
        where: { id: membershipId, providerId },
        include: { user: { select: { status: true } } },
      });
      if (existing === null) throw resourceNotFound('Membership');
      if (existing.user.status !== AccountStatus.ACTIVE) {
        throw invalidOperation('USER_NOT_ACTIVE', 'Only an active account can be assigned access.');
      }
      return transaction.providerMembership.update({
        where: { id: existing.id, providerId },
        data: { status: MembershipStatus.ACTIVE },
        include: memberInclude,
      });
    });
    return this.mapMember(updated);
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
