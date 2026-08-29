import { HttpStatus } from '@nestjs/common';

import { ApplicationException } from '../../common/exceptions/application.exception.js';

export function allowanceNotFound(): ApplicationException {
  return new ApplicationException(HttpStatus.NOT_FOUND, {
    code: 'ALLOWANCE_ACCOUNT_NOT_FOUND',
    message: 'Allowance account not found.',
    details: null,
  });
}

export function invalidAllowance(code: string, message: string): ApplicationException {
  return new ApplicationException(HttpStatus.BAD_REQUEST, { code, message, details: null });
}

export function allowanceConflict(code: string, message: string): ApplicationException {
  return new ApplicationException(HttpStatus.CONFLICT, { code, message, details: null });
}
