import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { PlatformRole } from '../../generated/prisma/enums.js';
import type { AuthenticatedRequest } from './authenticated-request.js';
import { REQUIRED_ROLES_KEY } from './roles.decorator.js';
import { Role, tenantRoles } from './role.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<readonly Role[] | undefined>(
      REQUIRED_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (requiredRoles === undefined || requiredRoles.length === 0) {
      return true;
    }

    const principal = context.switchToHttp().getRequest<AuthenticatedRequest>().auth;
    if (principal === undefined) {
      throw new ForbiddenException('Authentication context is required.');
    }

    if (
      requiredRoles.includes(Role.PLATFORM_ADMIN) &&
      principal.platformRole === PlatformRole.PLATFORM_ADMIN
    ) {
      return true;
    }

    if (requiredRoles.some((role) => tenantRoles.has(role))) {
      throw new ForbiddenException('Tenant-scoped authorization is required.');
    }

    throw new ForbiddenException('The current account does not have the required role.');
  }
}
