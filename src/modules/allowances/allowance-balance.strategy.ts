import { Injectable } from '@nestjs/common';

import { AllowanceTransactionType } from '../../generated/prisma/enums.js';
import { invalidAllowance } from './allowance-errors.js';
import { POSTGRES_BIGINT_MAX } from './allowance-money.js';

@Injectable()
export class AllowanceBalanceStrategy {
  nextBalance(type: AllowanceTransactionType, current: bigint, delta: bigint): bigint {
    this.assertDirection(type, delta);
    const next = current + delta;
    if (next < 0n) {
      throw invalidAllowance(
        'ALLOWANCE_INSUFFICIENT_BALANCE',
        'The allowance transaction would make the account balance negative.',
      );
    }
    if (next > POSTGRES_BIGINT_MAX) {
      throw invalidAllowance(
        'ALLOWANCE_BALANCE_LIMIT_EXCEEDED',
        'The resulting allowance balance exceeds the supported minor-unit range.',
      );
    }
    return next;
  }

  private assertDirection(type: AllowanceTransactionType, delta: bigint): void {
    const credit =
      type === AllowanceTransactionType.INITIAL_ALLOCATION ||
      type === AllowanceTransactionType.TOP_UP ||
      type === AllowanceTransactionType.CANCELLATION_REFUND;
    const debit =
      type === AllowanceTransactionType.BOOKING_DEBIT ||
      type === AllowanceTransactionType.EXPIRATION;
    const valid = credit ? delta > 0n : debit ? delta < 0n : delta !== 0n;
    if (!valid) {
      throw invalidAllowance(
        'ALLOWANCE_TRANSACTION_DIRECTION_INVALID',
        'The amount direction is invalid for this allowance transaction type.',
      );
    }
  }
}
