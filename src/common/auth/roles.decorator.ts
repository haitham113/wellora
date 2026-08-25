import { SetMetadata } from '@nestjs/common';

import type { Role } from './role.js';

export const REQUIRED_ROLES_KEY = 'requiredRoles';

export const RequireRoles = (
  role: Role,
  ...additionalRoles: readonly Role[]
): MethodDecorator & ClassDecorator => SetMetadata(REQUIRED_ROLES_KEY, [role, ...additionalRoles]);
