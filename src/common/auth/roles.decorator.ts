import { SetMetadata } from '@nestjs/common';

import type { Role } from './role.js';

export const REQUIRED_ROLES_KEY = 'requiredRoles';

export const RequireRoles = (...roles: readonly Role[]): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_ROLES_KEY, roles);
