import { Injectable } from '@nestjs/common';

import type { AuthPrincipal } from '../../common/auth/auth-principal.js';
import { paginationMeta } from '../../common/pagination/page-query.dto.js';
import {
  EmployeeStatus,
  EmployerMembershipRole,
  MembershipStatus,
  OrganizationStatus,
} from '../../generated/prisma/enums.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { EmployerAuthorizationPolicy } from '../employers/employer-authorization.policy.js';
import { allowanceNotFound, invalidAllowance } from './allowance-errors.js';
import {
  allowanceAccountSelect,
  allowanceTransactionSelect,
  mapAllowanceAccount,
  mapAllowanceTransaction,
  type AllowanceAccountRecord,
} from './allowance.mapper.js';
import type {
  AllowanceTransactionListQueryDto,
  SelfAllowanceQueryDto,
  SelfAllowanceTransactionListQueryDto,
} from './dto/allowance-request.dto.js';
import type {
  AllowanceAccountResponseDto,
  AllowanceTransactionPageResponseDto,
} from './dto/allowance-response.dto.js';

@Injectable()
export class AllowanceQueriesService {
  constructor(
    private readonly database: PrismaService,
    private readonly authorization: EmployerAuthorizationPolicy,
  ) {}

  async getEmployerAccount(
    principal: AuthPrincipal,
    employerId: string,
    employeeId: string,
  ): Promise<AllowanceAccountResponseDto> {
    await this.authorization.authorize(principal, employerId, [EmployerMembershipRole.ADMIN]);
    const account = await this.database.allowanceAccount.findFirst({
      where: { employerId, employeeId },
      select: allowanceAccountSelect,
    });
    if (account === null) throw allowanceNotFound();
    return mapAllowanceAccount(account);
  }

  async listEmployerTransactions(
    principal: AuthPrincipal,
    employerId: string,
    employeeId: string,
    query: AllowanceTransactionListQueryDto,
  ): Promise<AllowanceTransactionPageResponseDto> {
    await this.authorization.authorize(principal, employerId, [EmployerMembershipRole.ADMIN]);
    const account = await this.database.allowanceAccount.findFirst({
      where: { employerId, employeeId },
      select: { id: true },
    });
    if (account === null) throw allowanceNotFound();
    return this.listTransactions(account.id, query);
  }

  async getSelfAccount(
    principal: AuthPrincipal,
    query: SelfAllowanceQueryDto,
  ): Promise<AllowanceAccountResponseDto> {
    return mapAllowanceAccount(await this.resolveSelfAccount(principal, query.employerId));
  }

  async listSelfTransactions(
    principal: AuthPrincipal,
    query: SelfAllowanceTransactionListQueryDto,
  ): Promise<AllowanceTransactionPageResponseDto> {
    const account = await this.resolveSelfAccount(principal, query.employerId);
    return this.listTransactions(account.id, query);
  }

  private async listTransactions(
    accountId: string,
    query: AllowanceTransactionListQueryDto,
  ): Promise<AllowanceTransactionPageResponseDto> {
    const where = {
      accountId,
      ...(query.type === undefined ? {} : { type: query.type }),
    };
    const [records, total] = await this.database.$transaction([
      this.database.allowanceTransaction.findMany({
        where,
        orderBy: { sequence: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: allowanceTransactionSelect,
      }),
      this.database.allowanceTransaction.count({ where }),
    ]);
    return {
      data: records.map(mapAllowanceTransaction),
      meta: paginationMeta(query.page, query.limit, total),
    };
  }

  private async resolveSelfAccount(
    principal: AuthPrincipal,
    employerId: string | undefined,
  ): Promise<AllowanceAccountRecord> {
    const accounts = await this.database.allowanceAccount.findMany({
      where: {
        ...(employerId === undefined ? {} : { employerId }),
        employee: {
          userId: principal.userId,
          status: EmployeeStatus.ACTIVE,
          employer: {
            status: OrganizationStatus.ACTIVE,
            memberships: {
              some: {
                userId: principal.userId,
                role: EmployerMembershipRole.EMPLOYEE,
                status: MembershipStatus.ACTIVE,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 2,
      select: allowanceAccountSelect,
    });
    const account = accounts[0];
    if (account === undefined) throw allowanceNotFound();
    if (accounts.length > 1) {
      throw invalidAllowance(
        'ALLOWANCE_EMPLOYER_REQUIRED',
        'Specify employerId because the current user has multiple allowance accounts.',
      );
    }
    return account;
  }
}
