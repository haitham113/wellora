import { ApplicationException } from '../../common/exceptions/application.exception.js';
import { AllowanceTransactionType } from '../../generated/prisma/enums.js';
import { AllowanceBalanceStrategy } from './allowance-balance.strategy.js';

describe('AllowanceBalanceStrategy', () => {
  const strategy = new AllowanceBalanceStrategy();

  it('applies every supported ledger direction exactly', () => {
    expect(strategy.nextBalance(AllowanceTransactionType.INITIAL_ALLOCATION, 0n, 10_000n)).toBe(
      10_000n,
    );
    expect(strategy.nextBalance(AllowanceTransactionType.TOP_UP, 10_000n, 1_000n)).toBe(11_000n);
    expect(strategy.nextBalance(AllowanceTransactionType.BOOKING_DEBIT, 11_000n, -2_500n)).toBe(
      8_500n,
    );
    expect(strategy.nextBalance(AllowanceTransactionType.CANCELLATION_REFUND, 8_500n, 2_500n)).toBe(
      11_000n,
    );
    expect(strategy.nextBalance(AllowanceTransactionType.MANUAL_ADJUSTMENT, 11_000n, -500n)).toBe(
      10_500n,
    );
    expect(strategy.nextBalance(AllowanceTransactionType.EXPIRATION, 10_500n, -500n)).toBe(10_000n);
  });

  it('rejects overdrafts and transaction directions that contradict their type', () => {
    expect(() => strategy.nextBalance(AllowanceTransactionType.BOOKING_DEBIT, 100n, -101n)).toThrow(
      ApplicationException,
    );
    expect(() => strategy.nextBalance(AllowanceTransactionType.TOP_UP, 100n, -1n)).toThrow(
      ApplicationException,
    );
    expect(() =>
      strategy.nextBalance(AllowanceTransactionType.MANUAL_ADJUSTMENT, 100n, 0n),
    ).toThrow(ApplicationException);
  });
});
