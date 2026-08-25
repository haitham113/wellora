import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';

import { PlatformRole } from '../../generated/prisma/enums.js';
import { ApplicationException } from '../exceptions/application.exception.js';
import { AUTHENTICATED_ONLY_KEY } from './authenticated.decorator.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import { Role } from './role.js';
import { REQUIRED_ROLES_KEY } from './roles.decorator.js';
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

function reflectorWith(metadata: {
  authenticatedOnly?: boolean;
  isPublic?: boolean;
  roles?: readonly Role[];
}): Reflector {
  return {
    getAllAndOverride: jest.fn((key: string) => {
      if (key === IS_PUBLIC_KEY) return metadata.isPublic;
      if (key === AUTHENTICATED_ONLY_KEY) return metadata.authenticatedOnly;
      if (key === REQUIRED_ROLES_KEY) return metadata.roles;
      return undefined;
    }),
  } as unknown as Reflector;
}

function expectApplicationError(action: () => unknown, code: string): void {
  try {
    action();
    throw new Error(`Expected ${code} to be thrown.`);
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(ApplicationException);
    if (!(error instanceof ApplicationException)) {
      return;
    }

    expect(error.getResponse()).toMatchObject({ code });
  }
}

describe('RolesGuard', () => {
  it('allows a current platform administrator for explicit global authorization', () => {
    const guard = new RolesGuard(reflectorWith({ roles: [Role.PLATFORM_ADMIN] }));

    expect(guard.canActivate(contextWithRole(PlatformRole.PLATFORM_ADMIN))).toBe(true);
  });

  it('never treats a tenant role as a global role', () => {
    const guard = new RolesGuard(reflectorWith({ roles: [Role.EMPLOYER_ADMIN] }));

    expectApplicationError(() => guard.canActivate(contextWithRole(null)), 'AUTHORIZATION_DENIED');
  });

  it('allows routes explicitly marked as authentication-only', () => {
    const guard = new RolesGuard(reflectorWith({ authenticatedOnly: true }));

    expect(guard.canActivate(contextWithRole(null))).toBe(true);
  });

  it('fails closed when a protected route declares no authorization intent', () => {
    const guard = new RolesGuard(reflectorWith({}));

    expectApplicationError(
      () => guard.canActivate(contextWithRole(null)),
      'AUTHORIZATION_POLICY_REQUIRED',
    );
  });

  it('rejects empty role policies and conflicting public role policies', () => {
    for (const metadata of [{ roles: [] }, { isPublic: true, roles: [Role.PLATFORM_ADMIN] }]) {
      const guard = new RolesGuard(reflectorWith(metadata));
      expectApplicationError(
        () => guard.canActivate(contextWithRole(null)),
        'AUTHORIZATION_POLICY_MISCONFIGURED',
      );
    }
  });
});
