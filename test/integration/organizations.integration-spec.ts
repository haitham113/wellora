import { Test, type TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';

import { AppModule } from '../../src/app.module.js';
import {
  AccountStatus,
  EmployerMembershipRole,
  OrganizationStatus,
  ProviderMembershipRole,
} from '../../src/generated/prisma/enums.js';
import { PrismaService } from '../../src/infrastructure/database/prisma.service.js';
import { PasswordHasher } from '../../src/modules/auth/password-hasher.service.js';
import { EmployersService } from '../../src/modules/employers/employers.service.js';
import { ProvidersService } from '../../src/modules/providers/providers.service.js';

describe('organization persistence (integration)', () => {
  let module: TestingModule;
  let database: PrismaService;
  let passwordHasher: PasswordHasher;
  let employers: EmployersService;
  let providers: ProvidersService;
  const prefix = `p3int-${randomUUID().slice(0, 8)}`;
  const userIds: string[] = [];

  beforeAll(async () => {
    module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    database = module.get(PrismaService);
    passwordHasher = module.get(PasswordHasher);
    employers = module.get(EmployersService);
    providers = module.get(ProvidersService);
  });

  afterAll(async () => {
    await database.providerMembership.deleteMany({ where: { userId: { in: userIds } } });
    await database.provider.deleteMany({ where: { normalizedSlug: { startsWith: prefix } } });
    await database.employee.deleteMany({ where: { normalizedEmail: { startsWith: prefix } } });
    await database.employerMembership.deleteMany({ where: { userId: { in: userIds } } });
    await database.employer.deleteMany({ where: { normalizedSlug: { startsWith: prefix } } });
    await database.user.deleteMany({ where: { id: { in: userIds } } });
    await module.close();
  });

  async function createUser(suffix: string): Promise<string> {
    const email = `${prefix}-${suffix}@example.com`;
    const created = await database.user.create({
      data: {
        email,
        normalizedEmail: email,
        passwordHash: await passwordHasher.hash('correct horse battery staple'),
        status: AccountStatus.ACTIVE,
        emailVerifiedAt: new Date(),
      },
      select: { id: true },
    });
    userIds.push(created.id);
    return created.id;
  }

  it('creates each organization and its initial admin in one transaction', async () => {
    const employerAdminId = await createUser('employer-admin');
    const providerAdminId = await createUser('provider-admin');
    const employer = await employers.create({
      name: 'Integration Employer',
      slug: `${prefix}-employer`,
      country: 'EG',
      timezone: 'Africa/Cairo',
      defaultCurrency: 'EGP',
      initialAdminUserId: employerAdminId,
    });
    const provider = await providers.create({
      businessName: 'Integration Provider',
      slug: `${prefix}-provider`,
      country: 'EG',
      timezone: 'Africa/Cairo',
      commissionRateBps: 1000,
      initialAdminUserId: providerAdminId,
    });

    await expect(
      database.employerMembership.count({
        where: {
          employerId: employer.id,
          userId: employerAdminId,
          role: EmployerMembershipRole.ADMIN,
        },
      }),
    ).resolves.toBe(1);
    await expect(
      database.providerMembership.count({
        where: {
          providerId: provider.id,
          userId: providerAdminId,
          role: ProviderMembershipRole.ADMIN,
        },
      }),
    ).resolves.toBe(1);
  });

  it('rolls back organization onboarding when the initial administrator is invalid', async () => {
    const slug = `${prefix}-rolled-back`;
    await expect(
      employers.create({
        name: 'Must Roll Back',
        slug,
        country: 'EG',
        timezone: 'Africa/Cairo',
        defaultCurrency: 'EGP',
        initialAdminUserId: randomUUID(),
      }),
    ).rejects.toMatchObject({ response: { code: 'USER_NOT_FOUND' } });
    await expect(database.employer.count({ where: { normalizedSlug: slug } })).resolves.toBe(0);
  });

  it('enforces membership and tenant employee uniqueness in PostgreSQL', async () => {
    const userId = await createUser('uniqueness');
    const employer = await database.employer.create({
      data: {
        name: 'Unique Employer',
        slug: `${prefix}-unique-employer`,
        normalizedSlug: `${prefix}-unique-employer`,
        status: OrganizationStatus.ACTIVE,
        country: 'EG',
        timezone: 'Africa/Cairo',
        defaultCurrency: 'EGP',
      },
    });
    await database.employerMembership.create({
      data: { employerId: employer.id, userId, role: EmployerMembershipRole.ADMIN },
    });
    await expect(
      database.employerMembership.create({
        data: { employerId: employer.id, userId, role: EmployerMembershipRole.EMPLOYEE },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });

    const normalizedEmail = `${prefix}-duplicate@example.com`;
    await database.employee.create({
      data: {
        employerId: employer.id,
        email: normalizedEmail,
        normalizedEmail,
        firstName: 'First',
        lastName: 'Employee',
      },
    });
    await expect(
      database.employee.create({
        data: {
          employerId: employer.id,
          email: normalizedEmail.toUpperCase(),
          normalizedEmail,
          firstName: 'Second',
          lastName: 'Employee',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('enforces commission and normalized-value constraints in PostgreSQL', async () => {
    await expect(
      database.provider.create({
        data: {
          businessName: 'Invalid Commission Provider',
          slug: `${prefix}-invalid-commission`,
          normalizedSlug: `${prefix}-invalid-commission`,
          country: 'EG',
          timezone: 'Africa/Cairo',
          commissionRateBps: 10_001,
        },
      }),
    ).rejects.toBeDefined();
    await expect(
      database.employer.create({
        data: {
          name: 'Invalid Normalization Employer',
          slug: `${prefix}-invalid-normalized`,
          normalizedSlug: `${prefix}-INVALID-normalized`,
          country: 'EG',
          timezone: 'Africa/Cairo',
          defaultCurrency: 'EGP',
        },
      }),
    ).rejects.toBeDefined();
  });
});
