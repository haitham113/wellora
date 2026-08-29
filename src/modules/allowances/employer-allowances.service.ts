import { Injectable } from '@nestjs/common';

import type { AuthPrincipal } from '../../common/auth/auth-principal.js';
import {
  AllowanceReferenceType,
  AllowanceTransactionType,
  EmployeeStatus,
  EmployerMembershipRole,
  LedgerActorType,
} from '../../generated/prisma/enums.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { EmployerAuthorizationPolicy } from '../employers/employer-authorization.policy.js';
import { resourceNotFound } from '../organizations/organization-errors.js';
import { allowanceConflict, allowanceNotFound, invalidAllowance } from './allowance-errors.js';
import { AllowanceLedgerService } from './allowance-ledger.service.js';
import type { AllowanceTransactionClient, LedgerCommand } from './allowance-ledger.types.js';
import {
  assertCurrency,
  parsePositiveMinorUnits,
  parseSignedMinorUnits,
} from './allowance-money.js';
import { allowanceAccountSelect } from './allowance.mapper.js';
import type {
  ExpireAllowanceDto,
  InitialAllocationDto,
  ManualAllowanceAdjustmentDto,
  TopUpAllowanceDto,
} from './dto/allowance-request.dto.js';
import type { AllowanceMutationResponseDto } from './dto/allowance-response.dto.js';

@Injectable()
export class EmployerAllowancesService {
  constructor(
    private readonly database: PrismaService,
    private readonly authorization: EmployerAuthorizationPolicy,
    private readonly ledger: AllowanceLedgerService,
  ) {}

  async initialAllocation(
    principal: AuthPrincipal,
    employerId: string,
    employeeId: string,
    input: InitialAllocationDto,
    correlationId: string,
  ): Promise<AllowanceMutationResponseDto> {
    const amount = parsePositiveMinorUnits(input.amountMinor);
    assertCurrency(input.currency);
    const command = this.userCommand(principal, correlationId, {
      type: AllowanceTransactionType.INITIAL_ALLOCATION,
      delta: amount,
      currency: input.currency,
      referenceType: AllowanceReferenceType.ALLOWANCE_GRANT,
      referenceId: input.referenceId,
      ...(input.note === undefined ? {} : { metadata: { note: input.note.trim() } }),
    });
    try {
      return await this.database.$transaction(async (transaction) => {
        await this.authorize(principal, employerId, transaction);
        const employee = await transaction.employee.findFirst({
          where: { id: employeeId, employerId },
          select: {
            id: true,
            status: true,
            employer: { select: { defaultCurrency: true } },
          },
        });
        if (employee === null) throw resourceNotFound('Employee');
        const existing = await transaction.allowanceAccount.findUnique({
          where: { employeeId },
          select: allowanceAccountSelect,
        });
        if (existing !== null) {
          return this.ledger.appendOrReturnExisting(transaction, existing, command, () => {
            throw allowanceConflict(
              'ALLOWANCE_ACCOUNT_ALREADY_EXISTS',
              'This employee already has an allowance account; use a top-up instead.',
            );
          });
        }
        this.assertActiveEmployee(employee.status, 'An initial allocation');
        if (input.currency !== employee.employer.defaultCurrency) {
          throw invalidAllowance(
            'ALLOWANCE_CURRENCY_MISMATCH',
            'The initial allocation currency must match the employer default currency.',
          );
        }
        const account = await transaction.allowanceAccount.create({
          data: { employerId, employeeId, currency: input.currency },
          select: allowanceAccountSelect,
        });
        return this.ledger.appendOrReturnExisting(transaction, account, command);
      });
    } catch (error: unknown) {
      if (isUniqueConstraintError(error)) {
        throw allowanceConflict(
          'ALLOWANCE_ACCOUNT_ALREADY_EXISTS',
          'This employee already has an allowance account or command reference.',
        );
      }
      throw error;
    }
  }

  topUp(
    principal: AuthPrincipal,
    employerId: string,
    employeeId: string,
    input: TopUpAllowanceDto,
    correlationId: string,
  ): Promise<AllowanceMutationResponseDto> {
    return this.apply(
      principal,
      employerId,
      employeeId,
      this.userCommand(principal, correlationId, {
        type: AllowanceTransactionType.TOP_UP,
        delta: parsePositiveMinorUnits(input.amountMinor),
        currency: input.currency,
        referenceType: AllowanceReferenceType.ALLOWANCE_GRANT,
        referenceId: input.referenceId,
        ...(input.note === undefined ? {} : { metadata: { note: input.note.trim() } }),
      }),
      true,
    );
  }

  manualAdjustment(
    principal: AuthPrincipal,
    employerId: string,
    employeeId: string,
    input: ManualAllowanceAdjustmentDto,
    correlationId: string,
  ): Promise<AllowanceMutationResponseDto> {
    const reason = input.reason.trim();
    return this.apply(
      principal,
      employerId,
      employeeId,
      this.userCommand(principal, correlationId, {
        type: AllowanceTransactionType.MANUAL_ADJUSTMENT,
        delta: parseSignedMinorUnits(input.amountDeltaMinor),
        currency: input.currency,
        referenceType: AllowanceReferenceType.MANUAL_ADJUSTMENT,
        referenceId: input.referenceId,
        metadata: { reason },
        auditReason: reason,
      }),
    );
  }

  expire(
    principal: AuthPrincipal,
    employerId: string,
    employeeId: string,
    input: ExpireAllowanceDto,
    correlationId: string,
  ): Promise<AllowanceMutationResponseDto> {
    return this.apply(
      principal,
      employerId,
      employeeId,
      this.userCommand(principal, correlationId, {
        type: AllowanceTransactionType.EXPIRATION,
        delta: -parsePositiveMinorUnits(input.amountMinor),
        currency: input.currency,
        referenceType: AllowanceReferenceType.EXPIRATION_POLICY,
        referenceId: input.referenceId,
        metadata: { reason: input.reason.trim() },
      }),
    );
  }

  private async apply(
    principal: AuthPrincipal,
    employerId: string,
    employeeId: string,
    command: LedgerCommand,
    requiresActiveEmployee = false,
  ): Promise<AllowanceMutationResponseDto> {
    assertCurrency(command.currency);
    return this.database.$transaction(async (transaction) => {
      await this.authorize(principal, employerId, transaction);
      await this.lockAccount(transaction, employerId, employeeId);
      const account = await transaction.allowanceAccount.findFirst({
        where: { employerId, employeeId },
        select: {
          ...allowanceAccountSelect,
          employee: { select: { status: true } },
        },
      });
      if (account === null) throw allowanceNotFound();
      return this.ledger.appendOrReturnExisting(
        transaction,
        account,
        command,
        requiresActiveEmployee
          ? () => {
              this.assertActiveEmployee(account.employee.status, 'A top-up');
            }
          : undefined,
      );
    });
  }

  private userCommand(
    principal: AuthPrincipal,
    correlationId: string,
    command: Omit<LedgerCommand, 'actorType' | 'actorUserId' | 'correlationId'>,
  ): LedgerCommand {
    return {
      ...command,
      actorType: LedgerActorType.USER,
      actorUserId: principal.userId,
      correlationId,
    };
  }

  private async authorize(
    principal: AuthPrincipal,
    employerId: string,
    transaction: AllowanceTransactionClient,
  ): Promise<void> {
    await this.authorization.authorize(
      principal,
      employerId,
      [EmployerMembershipRole.ADMIN],
      transaction,
    );
  }

  private async lockAccount(
    transaction: AllowanceTransactionClient,
    employerId: string,
    employeeId: string,
  ): Promise<void> {
    const rows = await transaction.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "allowance_accounts"
      WHERE "employer_id" = ${employerId}::uuid AND "employee_id" = ${employeeId}::uuid
      FOR UPDATE
    `;
    if (rows.length === 0) throw allowanceNotFound();
  }

  private assertActiveEmployee(status: EmployeeStatus, subject: string): void {
    if (status !== EmployeeStatus.ACTIVE) {
      throw invalidAllowance(
        'ALLOWANCE_EMPLOYEE_INACTIVE',
        `${subject} requires an active employee.`,
      );
    }
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
