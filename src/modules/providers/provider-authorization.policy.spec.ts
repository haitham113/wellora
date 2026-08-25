import type { AuthPrincipal } from '../../common/auth/auth-principal.js';
import {
  MembershipStatus,
  OrganizationStatus,
  PlatformRole,
  ProviderMembershipRole,
} from '../../generated/prisma/enums.js';
import type { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { ProviderAuthorizationPolicy } from './provider-authorization.policy.js';

const principal: AuthPrincipal = { userId: 'user-a', sessionId: 'session', platformRole: null };

describe('ProviderAuthorizationPolicy', () => {
  const findUnique = jest.fn();
  const findProvider = jest.fn();
  const policy = new ProviderAuthorizationPolicy({
    provider: { findUnique: findProvider },
    providerMembership: { findUnique },
  } as unknown as PrismaService);

  beforeEach(() => {
    findUnique.mockReset();
    findProvider.mockReset().mockResolvedValue({ id: 'provider-a' });
  });

  it('allows platform-admin access only after validating the tenant exists', async () => {
    await expect(
      policy.authorize({ ...principal, platformRole: PlatformRole.PLATFORM_ADMIN }, 'provider-a', [
        ProviderMembershipRole.ADMIN,
      ]),
    ).resolves.toEqual({ isPlatformAdmin: true, role: null });
    expect(findUnique).not.toHaveBeenCalled();
    expect(findProvider).toHaveBeenCalledWith({
      where: { id: 'provider-a' },
      select: { id: true },
    });
  });

  it('returns not found when a platform admin supplies an unknown tenant', async () => {
    findProvider.mockResolvedValue(null);
    await expect(
      policy.authorize({ ...principal, platformRole: PlatformRole.PLATFORM_ADMIN }, 'provider-x', [
        ProviderMembershipRole.ADMIN,
      ]),
    ).rejects.toMatchObject({ response: { code: 'PROVIDER_NOT_FOUND' } });
  });

  it('allows staff only when the requested permission includes staff', async () => {
    findUnique.mockResolvedValue({
      role: ProviderMembershipRole.STAFF,
      status: MembershipStatus.ACTIVE,
      provider: { status: OrganizationStatus.ACTIVE },
    });

    await expect(
      policy.authorize(principal, 'provider-a', [ProviderMembershipRole.STAFF]),
    ).resolves.toEqual({ isPlatformAdmin: false, role: ProviderMembershipRole.STAFF });
    await expect(
      policy.authorize(principal, 'provider-a', [ProviderMembershipRole.ADMIN]),
    ).rejects.toMatchObject({ response: { code: 'AUTHORIZATION_DENIED' } });
  });

  it.each([MembershipStatus.INACTIVE, MembershipStatus.ACTIVE])(
    'denies inactive membership or provider state',
    async (membershipStatus) => {
      findUnique.mockResolvedValue({
        role: ProviderMembershipRole.ADMIN,
        status: membershipStatus,
        provider: {
          status:
            membershipStatus === MembershipStatus.ACTIVE
              ? OrganizationStatus.INACTIVE
              : OrganizationStatus.ACTIVE,
        },
      });
      await expect(
        policy.authorize(principal, 'provider-a', [ProviderMembershipRole.ADMIN]),
      ).rejects.toMatchObject({ response: { code: 'AUTHORIZATION_DENIED' } });
    },
  );
});
