import { Injectable } from '@nestjs/common';

import {
  AllowanceReferenceType,
  AllowanceTransactionType,
  LedgerActorType,
} from '../../generated/prisma/enums.js';
import { AllowanceBalanceStrategy } from './allowance-balance.strategy.js';
import { allowanceConflict, allowanceNotFound, invalidAllowance } from './allowance-errors.js';
import type {
  AllowanceTransactionClient,
  BookingAllowanceCommand,
  LedgerCommand,
} from './allowance-ledger.types.js';
import { assertCurrency } from './allowance-money.js';
import {
  allowanceAccountSelect,
  allowanceTransactionSelect,
  mapAllowanceAccount,
  mapAllowanceTransaction,
  type AllowanceAccountRecord,
  type AllowanceTransactionRecord,
} from './allowance.mapper.js';
import type { AllowanceMutationResponseDto } from './dto/allowance-response.dto.js';

@Injectable()
export class AllowanceLedgerService {
  constructor(private readonly balanceStrategy: AllowanceBalanceStrategy) {}

  async appendOrReturnExisting(
    transaction: AllowanceTransactionClient,
    account: AllowanceAccountRecord,
    command: LedgerCommand,
    beforeAppend?: () => void,
  ): Promise<AllowanceMutationResponseDto> {
    this.assertMatchingCurrency(account.currency, command.currency);
    const retry = await this.findMatchingTransaction(transaction, account, command);
    if (retry !== null) return this.mapMutation(account, retry);
    beforeAppend?.();
    return this.append(transaction, account, command);
  }

  recordBookingDebit(
    transaction: AllowanceTransactionClient,
    command: BookingAllowanceCommand,
  ): Promise<AllowanceMutationResponseDto> {
    return this.applyBookingCommand(
      transaction,
      command,
      AllowanceTransactionType.BOOKING_DEBIT,
      -command.amountMinor,
    );
  }

  recordCancellationRefund(
    transaction: AllowanceTransactionClient,
    command: BookingAllowanceCommand,
  ): Promise<AllowanceMutationResponseDto> {
    return this.applyBookingCommand(
      transaction,
      command,
      AllowanceTransactionType.CANCELLATION_REFUND,
      command.amountMinor,
    );
  }

  private async applyBookingCommand(
    transaction: AllowanceTransactionClient,
    command: BookingAllowanceCommand,
    type: AllowanceTransactionType,
    delta: bigint,
  ): Promise<AllowanceMutationResponseDto> {
    if (command.amountMinor <= 0n) {
      throw invalidAllowance(
        'ALLOWANCE_AMOUNT_INVALID',
        'A booking allowance amount must be positive integer minor units.',
      );
    }
    assertCurrency(command.currency);
    await this.lockAccountById(transaction, command.accountId);
    const account = await transaction.allowanceAccount.findUnique({
      where: { id: command.accountId },
      select: allowanceAccountSelect,
    });
    if (account === null) throw allowanceNotFound();
    return this.appendOrReturnExisting(transaction, account, {
      type,
      delta,
      currency: command.currency,
      referenceType: AllowanceReferenceType.BOOKING,
      referenceId: command.bookingId,
      actorType: LedgerActorType.USER,
      actorUserId: command.actorUserId,
      correlationId: command.correlationId,
    });
  }

  private async append(
    transaction: AllowanceTransactionClient,
    account: AllowanceAccountRecord,
    command: LedgerCommand,
  ): Promise<AllowanceMutationResponseDto> {
    const resultingBalance = this.balanceStrategy.nextBalance(
      command.type,
      account.currentBalanceMinor,
      command.delta,
    );
    const entry = await transaction.allowanceTransaction.create({
      data: {
        accountId: account.id,
        sequence: account.version + 1,
        type: command.type,
        amountDeltaMinor: command.delta,
        resultingBalanceMinor: resultingBalance,
        currency: command.currency,
        referenceType: command.referenceType,
        referenceId: command.referenceId,
        actorType: command.actorType,
        actorUserId: command.actorUserId,
        correlationId: command.correlationId,
        ...(command.metadata === undefined ? {} : { metadata: command.metadata }),
      },
      select: allowanceTransactionSelect,
    });
    await this.auditManualAdjustment(transaction, account, command, entry, resultingBalance);
    const updated = await transaction.allowanceAccount.update({
      where: { id: account.id, version: account.version },
      data: {
        currentBalanceMinor: resultingBalance,
        version: { increment: 1 },
      },
      select: allowanceAccountSelect,
    });
    return this.mapMutation(updated, entry);
  }

  private async auditManualAdjustment(
    transaction: AllowanceTransactionClient,
    account: AllowanceAccountRecord,
    command: LedgerCommand,
    entry: AllowanceTransactionRecord,
    resultingBalance: bigint,
  ): Promise<void> {
    if (command.type !== AllowanceTransactionType.MANUAL_ADJUSTMENT) return;
    if (command.actorUserId === null || command.auditReason === undefined) {
      throw new Error('Manual allowance adjustment audit context is incomplete.');
    }
    await transaction.auditLog.create({
      data: {
        actorUserId: command.actorUserId,
        action: 'ALLOWANCE_MANUAL_ADJUSTMENT',
        entityType: 'ALLOWANCE_TRANSACTION',
        entityId: entry.id,
        allowanceTransactionId: entry.id,
        beforeState: {
          balanceMinor: account.currentBalanceMinor.toString(),
          currency: account.currency,
        },
        afterState: { balanceMinor: resultingBalance.toString(), currency: account.currency },
        correlationId: command.correlationId,
        requestMetadata: { reason: command.auditReason },
      },
    });
  }

  private async findMatchingTransaction(
    transaction: AllowanceTransactionClient,
    account: AllowanceAccountRecord,
    command: LedgerCommand,
  ): Promise<AllowanceTransactionRecord | null> {
    const existing = await transaction.allowanceTransaction.findFirst({
      where: {
        accountId: account.id,
        referenceType: command.referenceType,
        referenceId: command.referenceId,
        ...(command.referenceType === AllowanceReferenceType.BOOKING ? { type: command.type } : {}),
      },
      select: allowanceTransactionSelect,
    });
    if (existing === null) return null;
    if (
      existing.type !== command.type ||
      existing.amountDeltaMinor !== command.delta ||
      existing.currency !== command.currency ||
      existing.actorType !== command.actorType ||
      existing.actorUserId !== command.actorUserId ||
      JSON.stringify(existing.metadata) !== JSON.stringify(command.metadata ?? null)
    ) {
      throw allowanceConflict(
        'ALLOWANCE_REFERENCE_REUSED',
        'The allowance reference was already used with different command values.',
      );
    }
    return existing;
  }

  private async lockAccountById(
    transaction: AllowanceTransactionClient,
    accountId: string,
  ): Promise<void> {
    const rows = await transaction.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "allowance_accounts" WHERE "id" = ${accountId}::uuid FOR UPDATE
    `;
    if (rows.length === 0) throw allowanceNotFound();
  }

  private assertMatchingCurrency(accountCurrency: string, commandCurrency: string): void {
    if (accountCurrency !== commandCurrency) {
      throw invalidAllowance(
        'ALLOWANCE_CURRENCY_MISMATCH',
        `This account accepts only ${accountCurrency} minor-unit transactions.`,
      );
    }
  }

  private mapMutation(
    account: AllowanceAccountRecord,
    transaction: AllowanceTransactionRecord,
  ): AllowanceMutationResponseDto {
    return {
      account: mapAllowanceAccount(account),
      transaction: mapAllowanceTransaction(transaction),
    };
  }
}
