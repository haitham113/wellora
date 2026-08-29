import { Injectable } from '@nestjs/common';
import { isISO4217CurrencyCode } from 'class-validator';

const BASIS_POINT_DENOMINATOR = 10_000n;
const HALF_BASIS_POINT_DENOMINATOR = 5_000n;
const POSTGRES_BIGINT_MAX = 9_223_372_036_854_775_807n;
const currencyPattern = /^[A-Z]{3}$/;

export interface CommissionSnapshot {
  grossAmountMinor: bigint;
  commissionRateBps: number;
  commissionAmountMinor: bigint;
  providerNetAmountMinor: bigint;
  currency: string;
}

@Injectable()
export class CommissionSnapshotStrategy {
  snapshot(
    grossAmountMinor: bigint,
    currency: string,
    commissionRateBps: number,
  ): CommissionSnapshot {
    if (grossAmountMinor < 0n || grossAmountMinor > POSTGRES_BIGINT_MAX) {
      throw new RangeError('Gross amount must fit a non-negative PostgreSQL bigint.');
    }
    if (!currencyPattern.test(currency) || !isISO4217CurrencyCode(currency)) {
      throw new RangeError('Currency must be a three-letter uppercase ISO 4217 code.');
    }
    if (
      !Number.isInteger(commissionRateBps) ||
      commissionRateBps < 0 ||
      commissionRateBps > 10_000
    ) {
      throw new RangeError('Commission rate must be integer basis points from 0 to 10000.');
    }

    // Round half up to the nearest minor unit. All operands remain exact integers.
    const commissionAmountMinor =
      (grossAmountMinor * BigInt(commissionRateBps) + HALF_BASIS_POINT_DENOMINATOR) /
      BASIS_POINT_DENOMINATOR;
    return {
      grossAmountMinor,
      commissionRateBps,
      commissionAmountMinor,
      providerNetAmountMinor: grossAmountMinor - commissionAmountMinor,
      currency,
    };
  }
}
