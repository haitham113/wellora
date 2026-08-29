import { CommissionSnapshotStrategy } from './commission-snapshot.strategy.js';

describe('CommissionSnapshotStrategy', () => {
  const strategy = new CommissionSnapshotStrategy();

  it('snapshots gross, rate, rounded commission, net and currency using exact integers', () => {
    expect(strategy.snapshot(10_005n, 'GBP', 1250)).toEqual({
      grossAmountMinor: 10_005n,
      commissionRateBps: 1250,
      commissionAmountMinor: 1_251n,
      providerNetAmountMinor: 8_754n,
      currency: 'GBP',
    });
  });

  it('uses deterministic half-up rounding at the minor-unit boundary', () => {
    expect(strategy.snapshot(1n, 'GBP', 5000).commissionAmountMinor).toBe(1n);
    expect(strategy.snapshot(1n, 'GBP', 4999).commissionAmountMinor).toBe(0n);
  });

  it('supports zero and full commission without violating gross = commission + net', () => {
    for (const rate of [0, 10_000]) {
      const snapshot = strategy.snapshot(9_007_199_254_740_993n, 'EGP', rate);
      expect(snapshot.commissionAmountMinor + snapshot.providerNetAmountMinor).toBe(
        snapshot.grossAmountMinor,
      );
    }
  });

  it.each([
    [-1n, 'GBP', 1000],
    [100n, 'gbp', 1000],
    [100n, 'GBP', 10_001],
    [100n, 'GBP', 1.5],
  ] as const)('rejects invalid snapshot input %#', (gross, currency, rate) => {
    expect(() => strategy.snapshot(gross, currency, rate)).toThrow(RangeError);
  });
});
