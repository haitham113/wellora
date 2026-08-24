import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

const trustedRequestId = /^[A-Za-z0-9._:-]{1,128}$/;

export interface RequestWithRequestId extends Request {
  requestId?: string;
}

export function resolveRequestId(value: string | string[] | undefined): string {
  return typeof value === 'string' && trustedRequestId.test(value) ? value : randomUUID();
}

export function requestIdMiddleware(
  request: RequestWithRequestId,
  response: Response,
  next: NextFunction,
): void {
  const requestId = resolveRequestId(request.headers['x-request-id']);
  request.requestId = requestId;
  request.headers['x-request-id'] = requestId;
  response.setHeader('x-request-id', requestId);
  next();
}
