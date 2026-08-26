import { invalidActivityOperation } from './activity-errors.js';

const POSTGRES_BIGINT_MAX = 9_223_372_036_854_775_807n;
const minorUnitsPattern = /^(0|[1-9][0-9]{0,18})$/;

export function parseMinorUnits(value: string): bigint {
  if (!minorUnitsPattern.test(value)) {
    throw invalidActivityOperation(
      'ACTIVITY_PRICE_INVALID',
      'Price must be a non-negative integer in minor units.',
    );
  }
  const amount = BigInt(value);
  if (amount > POSTGRES_BIGINT_MAX) {
    throw invalidActivityOperation(
      'ACTIVITY_PRICE_INVALID',
      'Price exceeds the supported minor-unit range.',
    );
  }
  return amount;
}
