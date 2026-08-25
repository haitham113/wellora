import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { PlatformRole } from '../../generated/prisma/enums.js';
import { ApplicationException } from '../exceptions/application.exception.js';
import { AUTHENTICATED_ONLY_KEY } from './authenticated.decorator.js';
import type { AuthenticatedRequest } from './authenticated-request.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import { REQUIRED_ROLES_KEY } from './roles.decorator.js';
import { Role, tenantRoles } from './role.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets);
    const requiredRoles = this.reflector.getAllAndOverride<readonly Role[] | undefined>(
      REQUIRED_ROLES_KEY,
      targets,
    );
    const authenticatedOnly = this.reflector.getAllAndOverride<boolean>(
      AUTHENTICATED_ONLY_KEY,
      targets,
    );

    if (isPublic) {
      if (requiredRoles !== undefined) {
        throw this.policyMisconfigured();
      }
      return true;
    }

    if (requiredRoles === undefined) {
      if (authenticatedOnly) {
        return true;
      }
      throw this.policyRequired();
    }

    if (requiredRoles.length === 0) {
      throw this.policyMisconfigured();
    }

    const principal = context.switchToHttp().getRequest<AuthenticatedRequest>().auth;
    if (principal === undefined) {
      throw this.denied();
    }

    if (
      requiredRoles.includes(Role.PLATFORM_ADMIN) &&
      principal.platformRole === PlatformRole.PLATFORM_ADMIN
    ) {
      return true;
    }

    if (requiredRoles.some((role) => tenantRoles.has(role))) {
      throw this.denied();
    }

    throw this.denied();
  }

  private denied(): ApplicationException {
    return new ApplicationException(HttpStatus.FORBIDDEN, {
      code: 'AUTHORIZATION_DENIED',
      message: 'The current account is not permitted to perform this operation.',
      details: null,
    });
  }

  private policyRequired(): ApplicationException {
    return new ApplicationException(HttpStatus.FORBIDDEN, {
      code: 'AUTHORIZATION_POLICY_REQUIRED',
      message: 'This route does not declare an authorization policy.',
      details: null,
    });
  }

  private policyMisconfigured(): ApplicationException {
    return new ApplicationException(HttpStatus.INTERNAL_SERVER_ERROR, {
      code: 'AUTHORIZATION_POLICY_MISCONFIGURED',
      message: 'This route has conflicting authorization metadata.',
      details: null,
    });
  }
}
