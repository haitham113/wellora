import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';

import type { RequestWithRequestId } from '../http/request-id.middleware.js';
import { ApplicationException, type ApplicationErrorBody } from './application.exception.js';

interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details: unknown;
    requestId: string;
  };
}

function isApplicationErrorBody(value: unknown): value is ApplicationErrorBody {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return typeof candidate.code === 'string' && typeof candidate.message === 'string';
}

function getHttpErrorCode(status: number): string {
  const statusName = HttpStatus[status];
  return typeof statusName === 'string' ? `HTTP_${statusName}` : 'HTTP_ERROR';
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<RequestWithRequestId>();
    const response = context.getResponse<Response<ApiErrorResponse>>();
    const requestId = request.requestId ?? 'unknown';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_SERVER_ERROR';
    let message = 'An unexpected error occurred.';
    let details: unknown = null;

    if (exception instanceof ApplicationException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (isApplicationErrorBody(exceptionResponse)) {
        ({ code, message, details = null } = exceptionResponse);
      }
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
        this.logger.error(
          `Unhandled HTTP error requestId=${requestId} exceptionType=${exception.constructor.name}`,
        );
      } else {
        code = status === HttpStatus.BAD_REQUEST ? 'VALIDATION_FAILED' : getHttpErrorCode(status);

        if (typeof exceptionResponse === 'string') {
          message = exceptionResponse;
        } else {
          const body = exceptionResponse as Record<string, unknown>;
          const responseMessage = body.message;
          message = Array.isArray(responseMessage)
            ? 'The request payload is invalid.'
            : typeof responseMessage === 'string'
              ? responseMessage
              : exception.message;
          details = Array.isArray(responseMessage) ? { messages: responseMessage } : null;
        }
      }
    } else {
      const exceptionType =
        exception instanceof Error ? exception.constructor.name : typeof exception;
      this.logger.error(
        `Unhandled request error requestId=${requestId} exceptionType=${exceptionType}`,
      );
    }

    response.status(status).json({
      error: {
        code,
        message,
        details,
        requestId,
      },
    });
  }
}
