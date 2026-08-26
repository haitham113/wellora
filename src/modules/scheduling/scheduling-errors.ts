import { HttpStatus } from '@nestjs/common';

import { ApplicationException } from '../../common/exceptions/application.exception.js';

export function sessionNotFound(): ApplicationException {
  return schedulingError(HttpStatus.NOT_FOUND, 'SESSION_NOT_FOUND', 'Session not found.');
}

export function scheduleNotFound(): ApplicationException {
  return schedulingError(HttpStatus.NOT_FOUND, 'SCHEDULE_NOT_FOUND', 'Schedule not found.');
}

export function invalidSchedule(
  code: string,
  message: string,
  details: unknown = null,
): ApplicationException {
  return schedulingError(HttpStatus.BAD_REQUEST, code, message, details);
}

export function schedulingConflict(code: string, message: string): ApplicationException {
  return schedulingError(HttpStatus.CONFLICT, code, message);
}

function schedulingError(
  status: HttpStatus,
  code: string,
  message: string,
  details: unknown = null,
): ApplicationException {
  return new ApplicationException(status, { code, message, details });
}
