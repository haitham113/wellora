import { isISO4217CurrencyCode } from 'class-validator';

import type { ApplicationException } from '../../common/exceptions/application.exception.js';
import { invalidAllowance } from './allowance-errors.js';

export const POSTGRES_BIGINT_MAX = 9_223_372_036_854_775_807n;
const positiveMinorPattern = /^[1-9][0-9]{0,18}$/;
const signedMinorPattern = /^-?[1-9][0-9]{0,18}$/;
const currencyPattern = /^[A-Z]{3}$/;

export function parsePositiveMinorUnits(value: string): bigint {
  if (!positiveMinorPattern.test(value)) throw invalidAmount();
  const amount = BigInt(value);
  if (amount > POSTGRES_BIGINT_MAX) throw invalidAmount();
  return amount;
}

export function parseSignedMinorUnits(value: string): bigint {
  if (!signedMinorPattern.test(value)) throw invalidAmount();
  const amount = BigInt(value);
  if (amount > POSTGRES_BIGINT_MAX || amount < -POSTGRES_BIGINT_MAX) throw invalidAmount();
  return amount;
}

export function assertCurrency(currency: string): void {
  if (!currencyPattern.test(currency) || !isISO4217CurrencyCode(currency)) {
    throw invalidAllowance(
      'ALLOWANCE_CURRENCY_INVALID',
      'Currency must be a three-letter uppercase ISO 4217 code.',
    );
  }
}

function invalidAmount(): ApplicationException {
  return invalidAllowance(
    'ALLOWANCE_AMOUNT_INVALID',
    'Amount must be a non-zero integer minor-unit string within the PostgreSQL bigint range.',
  );
}
