import type { AuthPrincipal } from '../../common/auth/auth-principal.js';
import {
  EmployerMembershipRole,
  MembershipStatus,
  OrganizationStatus,
  PlatformRole,
} from '../../generated/prisma/enums.js';
import type { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { EmployerAuthorizationPolicy } from './employer-authorization.policy.js';

const principal: AuthPrincipal = { userId: 'user-a', sessionId: 'session', platformRole: null };

describe('EmployerAuthorizationPolicy', () => {
  const findUnique = jest.fn();
  const findEmployer = jest.fn();
  const policy = new EmployerAuthorizationPolicy({
    employer: { findUnique: findEmployer },
    employerMembership: { findUnique },
  } as unknown as PrismaService);

  beforeEach(() => {
    findUnique.mockReset();
    findEmployer.mockReset().mockResolvedValue({ id: 'employer-a' });
  });

  it('allows platform-admin access only after validating the tenant exists', async () => {
    await expect(
      policy.authorize({ ...principal, platformRole: PlatformRole.PLATFORM_ADMIN }, 'employer-a', [
        EmployerMembershipRole.ADMIN,
      ]),
    ).resolves.toEqual({ isPlatformAdmin: true, role: null });
    expect(findUnique).not.toHaveBeenCalled();
    expect(findEmployer).toHaveBeenCalledWith({
      where: { id: 'employer-a' },
      select: { id: true },
    });
  });

  it('returns not found when a platform admin supplies an unknown tenant', async () => {
    findEmployer.mockResolvedValue(null);
    await expect(
      policy.authorize({ ...principal, platformRole: PlatformRole.PLATFORM_ADMIN }, 'employer-x', [
        EmployerMembershipRole.ADMIN,
      ]),
    ).rejects.toMatchObject({ response: { code: 'EMPLOYER_NOT_FOUND' } });
  });

  it('allows only a current role on an active membership and employer', async () => {
    findUnique.mockResolvedValue({
      role: EmployerMembershipRole.ADMIN,
      status: MembershipStatus.ACTIVE,
      employer: { status: OrganizationStatus.ACTIVE },
    });

    await expect(
      policy.authorize(principal, 'employer-a', [EmployerMembershipRole.ADMIN]),
    ).resolves.toEqual({ isPlatformAdmin: false, role: EmployerMembershipRole.ADMIN });
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { employerId_userId: { employerId: 'employer-a', userId: 'user-a' } },
      }),
    );
  });

  it.each([
    null,
    {
      role: EmployerMembershipRole.ADMIN,
      status: MembershipStatus.INACTIVE,
      employer: { status: OrganizationStatus.ACTIVE },
    },
    {
      role: EmployerMembershipRole.ADMIN,
      status: MembershipStatus.ACTIVE,
      employer: { status: OrganizationStatus.INACTIVE },
    },
    {
      role: EmployerMembershipRole.EMPLOYEE,
      status: MembershipStatus.ACTIVE,
      employer: { status: OrganizationStatus.ACTIVE },
    },
  ])('denies missing, inactive, or insufficient tenant authority', async (membership) => {
    findUnique.mockResolvedValue(membership);
    await expect(
      policy.authorize(principal, 'employer-a', [EmployerMembershipRole.ADMIN]),
    ).rejects.toMatchObject({ response: { code: 'AUTHORIZATION_DENIED' } });
  });
});
