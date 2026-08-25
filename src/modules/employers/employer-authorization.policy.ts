import { Injectable } from '@nestjs/common';

import type { AuthPrincipal } from '../../common/auth/auth-principal.js';
import {
  EmployerMembershipRole,
  MembershipStatus,
  OrganizationStatus,
  PlatformRole,
} from '../../generated/prisma/enums.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { authorizationDenied, resourceNotFound } from '../organizations/organization-errors.js';

export interface EmployerAuthorization {
  isPlatformAdmin: boolean;
  role: EmployerMembershipRole | null;
}

type EmployerAuthorizationDatabase = Pick<PrismaService, 'employer' | 'employerMembership'>;

@Injectable()
export class EmployerAuthorizationPolicy {
  constructor(private readonly database: PrismaService) {}

  async authorize(
    principal: AuthPrincipal,
    employerId: string,
    roles: readonly EmployerMembershipRole[],
    database: EmployerAuthorizationDatabase = this.database,
  ): Promise<EmployerAuthorization> {
    if (principal.platformRole === PlatformRole.PLATFORM_ADMIN) {
      const employer = await database.employer.findUnique({
        where: { id: employerId },
        select: { id: true },
      });
      if (employer === null) throw resourceNotFound('Employer');
      return { isPlatformAdmin: true, role: null };
    }

    const membership = await database.employerMembership.findUnique({
      where: { employerId_userId: { employerId, userId: principal.userId } },
      select: {
        role: true,
        status: true,
        employer: { select: { status: true } },
      },
    });

    if (
      membership?.status !== MembershipStatus.ACTIVE ||
      membership.employer.status !== OrganizationStatus.ACTIVE ||
      !roles.includes(membership.role)
    ) {
      throw authorizationDenied();
    }

    return { isPlatformAdmin: false, role: membership.role };
  }
}
