import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type { AuthPrincipal } from './auth-principal.js';
import type { AuthenticatedRequest } from './authenticated-request.js';

export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthPrincipal => {
    const principal = context.switchToHttp().getRequest<AuthenticatedRequest>().auth;

    if (principal === undefined) {
      throw new Error('Authenticated principal is unavailable.');
    }

    return principal;
  },
);
