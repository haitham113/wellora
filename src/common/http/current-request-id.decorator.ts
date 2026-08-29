import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type { RequestWithRequestId } from './request-id.middleware.js';

export const CurrentRequestId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const requestId = context.switchToHttp().getRequest<RequestWithRequestId>().requestId;
    if (requestId === undefined) throw new Error('Request correlation ID is unavailable.');
    return requestId;
  },
);
