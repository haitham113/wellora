import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';

import { PlatformRole } from '../../generated/prisma/enums.js';
import { Role } from './role.js';
import { RolesGuard } from './roles.guard.js';

function contextWithRole(platformRole: PlatformRole | null): ExecutionContext {
  class TestController {
    readonly marker = true;
  }

  return {
    getHandler: () =>
      function handler() {
        return true;
      },
    getClass: () => TestController,
    switchToHttp: () => ({
      getRequest: () => ({ auth: { userId: 'user', sessionId: 'session', platformRole } }),
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  it('allows a current platform administrator for global authorization', () => {
    const reflector = {
      getAllAndOverride: () => [Role.PLATFORM_ADMIN],
    } as unknown as Reflector;

    expect(
      new RolesGuard(reflector).canActivate(contextWithRole(PlatformRole.PLATFORM_ADMIN)),
    ).toBe(true);
  });

  it('never treats a tenant role as a global role', () => {
    const reflector = {
      getAllAndOverride: () => [Role.EMPLOYER_ADMIN],
    } as unknown as Reflector;

    expect(() => new RolesGuard(reflector).canActivate(contextWithRole(null))).toThrow(
      ForbiddenException,
    );
  });
});
