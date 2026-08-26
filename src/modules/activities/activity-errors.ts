import { HttpStatus } from '@nestjs/common';

import { ApplicationException } from '../../common/exceptions/application.exception.js';

export function activityNotFound(): ApplicationException {
  return new ApplicationException(HttpStatus.NOT_FOUND, {
    code: 'ACTIVITY_NOT_FOUND',
    message: 'Activity not found.',
    details: null,
  });
}

export function categoryNotFound(): ApplicationException {
  return new ApplicationException(HttpStatus.NOT_FOUND, {
    code: 'CATEGORY_NOT_FOUND',
    message: 'Category not found.',
    details: null,
  });
}

export function activityConflict(code: string, message: string): ApplicationException {
  return new ApplicationException(HttpStatus.CONFLICT, { code, message, details: null });
}

export function invalidActivityOperation(
  code: string,
  message: string,
  details: unknown = null,
): ApplicationException {
  return new ApplicationException(HttpStatus.BAD_REQUEST, { code, message, details });
}
