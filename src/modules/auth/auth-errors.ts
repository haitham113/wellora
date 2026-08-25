import { HttpStatus } from '@nestjs/common';

import { ApplicationException } from '../../common/exceptions/application.exception.js';

export function invalidCredentials(): ApplicationException {
  return new ApplicationException(HttpStatus.UNAUTHORIZED, {
    code: 'INVALID_CREDENTIALS',
    message: 'The email or password is incorrect.',
    details: null,
  });
}

export function invalidRefreshToken(): ApplicationException {
  return new ApplicationException(HttpStatus.UNAUTHORIZED, {
    code: 'INVALID_REFRESH_TOKEN',
    message: 'The refresh token is invalid or expired.',
    details: null,
  });
}

export function invalidOneTimeToken(): ApplicationException {
  return new ApplicationException(HttpStatus.BAD_REQUEST, {
    code: 'INVALID_OR_EXPIRED_TOKEN',
    message: 'The token is invalid, expired, or has already been used.',
    details: null,
  });
}

export function accountUnavailable(): ApplicationException {
  return new ApplicationException(HttpStatus.FORBIDDEN, {
    code: 'ACCOUNT_UNAVAILABLE',
    message: 'This account is not available for authentication.',
    details: null,
  });
}
