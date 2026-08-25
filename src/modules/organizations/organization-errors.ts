import { HttpStatus } from '@nestjs/common';

import { ApplicationException } from '../../common/exceptions/application.exception.js';

export function authorizationDenied(): ApplicationException {
  return new ApplicationException(HttpStatus.FORBIDDEN, {
    code: 'AUTHORIZATION_DENIED',
    message: 'The current account is not permitted to perform this operation.',
    details: null,
  });
}

export function resourceNotFound(
  resource: 'Employer' | 'Employee' | 'Provider' | 'Membership' | 'User',
): ApplicationException {
  return new ApplicationException(HttpStatus.NOT_FOUND, {
    code: `${resource.toUpperCase()}_NOT_FOUND`,
    message: `${resource} not found.`,
    details: null,
  });
}

export function conflict(code: string, message: string): ApplicationException {
  return new ApplicationException(HttpStatus.CONFLICT, { code, message, details: null });
}

export function invalidOperation(code: string, message: string): ApplicationException {
  return new ApplicationException(HttpStatus.BAD_REQUEST, { code, message, details: null });
}

export function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

export function normalizeSlug(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase();
}
