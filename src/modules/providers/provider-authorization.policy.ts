import { Injectable } from '@nestjs/common';

import type { AuthPrincipal } from '../../common/auth/auth-principal.js';
import {
  MembershipStatus,
  OrganizationStatus,
  PlatformRole,
  ProviderMembershipRole,
} from '../../generated/prisma/enums.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { authorizationDenied } from '../organizations/organization-errors.js';

export interface ProviderAuthorization {
  isPlatformAdmin: boolean;
  role: ProviderMembershipRole | null;
}

@Injectable()
export class ProviderAuthorizationPolicy {
  constructor(private readonly database: PrismaService) {}

  async authorize(
    principal: AuthPrincipal,
    providerId: string,
    roles: readonly ProviderMembershipRole[],
  ): Promise<ProviderAuthorization> {
    if (principal.platformRole === PlatformRole.PLATFORM_ADMIN) {
      return { isPlatformAdmin: true, role: null };
    }

    const membership = await this.database.providerMembership.findUnique({
      where: { providerId_userId: { providerId, userId: principal.userId } },
      select: {
        role: true,
        status: true,
        provider: { select: { status: true } },
      },
    });
    if (
      membership?.status !== MembershipStatus.ACTIVE ||
      membership.provider.status !== OrganizationStatus.ACTIVE ||
      !roles.includes(membership.role)
    ) {
      throw authorizationDenied();
    }

    return { isPlatformAdmin: false, role: membership.role };
  }
}
