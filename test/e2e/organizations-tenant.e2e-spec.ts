import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'supertest';

import { AppModule } from '../../src/app.module.js';
import { configureApplication } from '../../src/bootstrap.js';
import type { EnvironmentVariables } from '../../src/config/environment.schema.js';
import {
  AccountStatus,
  EmployerMembershipRole,
  OrganizationStatus,
  PlatformRole,
  ProviderMembershipRole,
} from '../../src/generated/prisma/enums.js';
import { PrismaService } from '../../src/infrastructure/database/prisma.service.js';
import { PasswordHasher } from '../../src/modules/auth/password-hasher.service.js';
import { setupSwagger } from '../../src/swagger.js';

interface TokenPairBody {
  accessToken: string;
}

describe('organization tenant authorization (e2e)', () => {
  let app: INestApplication;
  let httpServer: Server;
  let database: PrismaService;
  let passwordHasher: PasswordHasher;
  const marker = randomUUID().slice(0, 8);
  const prefix = `p3e2e-${marker}`;
  const password = 'correct horse battery staple';
  const users = new Map<string, { id: string; email: string }>();
  const tokens = new Map<string, string>();
  let employerAId: string;
  let employerBId: string;
  let employeeAId: string;
  let unlinkedEmployeeAId: string;
  let employeeBId: string;
  let providerAId: string;
  let providerBId: string;
  let employerBAdminMembershipId: string;
  let providerAStaffMembershipId: string;
  let providerBAdminMembershipId: string;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    const config = app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);
    configureApplication(app, config);
    setupSwagger(app, config);
    await app.init();
    httpServer = app.getHttpServer() as Server;
    database = app.get(PrismaService);
    passwordHasher = app.get(PasswordHasher);

    const passwordHash = await passwordHasher.hash(password);
    for (const name of [
      'platform',
      'employer-admin-a',
      'employer-admin-b',
      'employee-a',
      'employee-b',
      'provider-admin-a',
      'provider-admin-b',
      'provider-staff-a',
      'assignable',
      'employer-assignable',
      'employee-assignable',
      'provider-assignable',
    ]) {
      const email = `${prefix}-${name}@example.com`;
      const user = await database.user.create({
        data: {
          email,
          normalizedEmail: email,
          passwordHash,
          status: AccountStatus.ACTIVE,
          emailVerifiedAt: new Date(),
          ...(name === 'platform' ? { platformRole: PlatformRole.PLATFORM_ADMIN } : {}),
        },
        select: { id: true, email: true },
      });
      users.set(name, user);
    }

    const employerA = await database.employer.create({
      data: {
        name: `${prefix} Employer Alpha`,
        slug: `${prefix}-employer-alpha`,
        normalizedSlug: `${prefix}-employer-alpha`,
        status: OrganizationStatus.ACTIVE,
        country: 'EG',
        timezone: 'Africa/Cairo',
        defaultCurrency: 'EGP',
        memberships: {
          create: {
            userId: user('employer-admin-a').id,
            role: EmployerMembershipRole.ADMIN,
          },
        },
      },
    });
    const employerB = await database.employer.create({
      data: {
        name: `${prefix} Employer Beta`,
        slug: `${prefix}-employer-beta`,
        normalizedSlug: `${prefix}-employer-beta`,
        status: OrganizationStatus.ACTIVE,
        country: 'GB',
        timezone: 'Europe/London',
        defaultCurrency: 'GBP',
        memberships: {
          create: {
            userId: user('employer-admin-b').id,
            role: EmployerMembershipRole.ADMIN,
          },
        },
      },
      include: { memberships: true },
    });
    employerAId = employerA.id;
    employerBId = employerB.id;
    const employerBAdmin = employerB.memberships[0];
    if (employerBAdmin === undefined) throw new Error('Expected employer B administrator.');
    employerBAdminMembershipId = employerBAdmin.id;

    const employeeA = await database.employee.create({
      data: {
        employerId: employerA.id,
        userId: user('employee-a').id,
        email: user('employee-a').email,
        normalizedEmail: user('employee-a').email,
        firstName: 'Amal',
        lastName: 'Alpha',
        department: 'Engineering',
      },
    });
    await database.employerMembership.create({
      data: {
        employerId: employerA.id,
        userId: user('employee-a').id,
        role: EmployerMembershipRole.EMPLOYEE,
      },
    });
    const unlinked = await database.employee.create({
      data: {
        employerId: employerA.id,
        email: `${prefix}-unlinked@example.com`,
        normalizedEmail: `${prefix}-unlinked@example.com`,
        firstName: 'Nadia',
        lastName: 'Alpha',
        department: 'Finance',
      },
    });
    const employeeB = await database.employee.create({
      data: {
        employerId: employerB.id,
        userId: user('employee-b').id,
        email: user('employee-b').email,
        normalizedEmail: user('employee-b').email,
        firstName: 'Basma',
        lastName: 'Beta',
        department: 'Engineering',
      },
    });
    await database.employerMembership.create({
      data: {
        employerId: employerB.id,
        userId: user('employee-b').id,
        role: EmployerMembershipRole.EMPLOYEE,
      },
    });
    employeeAId = employeeA.id;
    unlinkedEmployeeAId = unlinked.id;
    employeeBId = employeeB.id;

    const providerA = await database.provider.create({
      data: {
        businessName: `${prefix} Provider Alpha`,
        slug: `${prefix}-provider-alpha`,
        normalizedSlug: `${prefix}-provider-alpha`,
        status: OrganizationStatus.ACTIVE,
        country: 'EG',
        timezone: 'Africa/Cairo',
        commissionRateBps: 1250,
        memberships: {
          create: [
            {
              userId: user('provider-admin-a').id,
              role: ProviderMembershipRole.ADMIN,
            },
            {
              userId: user('provider-staff-a').id,
              role: ProviderMembershipRole.STAFF,
            },
          ],
        },
      },
      include: { memberships: true },
    });
    const providerB = await database.provider.create({
      data: {
        businessName: `${prefix} Provider Beta`,
        slug: `${prefix}-provider-beta`,
        normalizedSlug: `${prefix}-provider-beta`,
        status: OrganizationStatus.ACTIVE,
        country: 'GB',
        timezone: 'Europe/London',
        commissionRateBps: 900,
        memberships: {
          create: {
            userId: user('provider-admin-b').id,
            role: ProviderMembershipRole.ADMIN,
          },
        },
      },
      include: { memberships: true },
    });
    providerAId = providerA.id;
    providerBId = providerB.id;
    const providerAStaff = providerA.memberships.find(
      (membership) => membership.role === ProviderMembershipRole.STAFF,
    );
    if (providerAStaff === undefined) throw new Error('Expected provider A staff member.');
    providerAStaffMembershipId = providerAStaff.id;
    const providerBAdmin = providerB.memberships[0];
    if (providerBAdmin === undefined) throw new Error('Expected provider B administrator.');
    providerBAdminMembershipId = providerBAdmin.id;

    for (const name of [
      'platform',
      'employer-admin-a',
      'employee-a',
      'provider-admin-a',
      'provider-staff-a',
    ]) {
      const response = await request(httpServer)
        .post('/api/v1/auth/login')
        .send({ email: user(name).email, password })
        .expect(200);
      tokens.set(name, (response.body as TokenPairBody).accessToken);
    }
  });

  afterAll(async () => {
    await database.providerMembership.deleteMany({
      where: { user: { normalizedEmail: { startsWith: prefix } } },
    });
    await database.provider.deleteMany({ where: { normalizedSlug: { startsWith: prefix } } });
    await database.employee.deleteMany({ where: { normalizedEmail: { startsWith: prefix } } });
    await database.employerMembership.deleteMany({
      where: { user: { normalizedEmail: { startsWith: prefix } } },
    });
    await database.employer.deleteMany({ where: { normalizedSlug: { startsWith: prefix } } });
    await database.user.deleteMany({
      where: { normalizedEmail: { startsWith: prefix } },
    });
    await app.close();
  });

  function user(name: string): { id: string; email: string } {
    const value = users.get(name);
    if (value === undefined) throw new Error(`Missing test user ${name}.`);
    return value;
  }

  function bearer(name: string): string {
    const token = tokens.get(name);
    if (token === undefined) throw new Error(`Missing access token ${name}.`);
    return `Bearer ${token}`;
  }

  it('enforces platform-admin global onboarding and bounded provider/employer search', async () => {
    await request(httpServer)
      .get('/api/v1/admin/employers')
      .set('authorization', bearer('employer-admin-a'))
      .expect(403);

    const employers = await request(httpServer)
      .get(`/api/v1/admin/employers?search=${prefix}&page=1&limit=1`)
      .set('authorization', bearer('platform'))
      .expect(200);
    const employerPage = employers.body as {
      data: { name: string }[];
      meta: { page: number; limit: number; total: number; totalPages: number };
    };
    expect(employerPage.data).toHaveLength(1);
    expect(employerPage.data[0]?.name).toContain(prefix);
    expect(employerPage.meta).toEqual({ page: 1, limit: 1, total: 2, totalPages: 2 });

    const providerResponse = await request(httpServer)
      .post('/api/v1/admin/providers')
      .set('authorization', bearer('platform'))
      .send({
        businessName: `${prefix} Onboarded Provider`,
        slug: `${prefix}-onboarded-provider`,
        country: 'EG',
        timezone: 'Africa/Cairo',
        commissionRateBps: 1000,
        initialAdminUserId: user('assignable').id,
      })
      .expect(201);
    const body = providerResponse.body as { id: string; status: OrganizationStatus };
    expect(body.status).toBe(OrganizationStatus.PENDING);
    await request(httpServer)
      .post(`/api/v1/admin/providers/${body.id}/activate`)
      .set('authorization', bearer('platform'))
      .expect(200)
      .expect(({ body: activated }) => {
        expect((activated as { status: OrganizationStatus }).status).toBe(
          OrganizationStatus.ACTIVE,
        );
      });

    const providers = await request(httpServer)
      .get(`/api/v1/admin/providers?search=${prefix}&country=EG&page=1&limit=2`)
      .set('authorization', bearer('platform'))
      .expect(200);
    const providerPage = providers.body as {
      data: { country: string }[];
      meta: { page: number; limit: number; total: number };
    };
    expect(providerPage.data.every((provider) => provider.country === 'EG')).toBe(true);
    expect(providerPage.meta).toMatchObject({ page: 1, limit: 2, total: 2 });
  });

  it('prevents Employer A from reading or mutating Employer B employees', async () => {
    const ownList = await request(httpServer)
      .get(`/api/v1/employers/${employerAId}/employees?department=engineering&limit=1`)
      .set('authorization', bearer('employer-admin-a'))
      .expect(200);
    expect(ownList.body as unknown).toMatchObject({
      data: [expect.objectContaining({ id: employeeAId, employerId: employerAId })],
      meta: { limit: 1, total: 1 },
    });

    await request(httpServer)
      .get(`/api/v1/employers/${employerBId}/employees/${employeeBId}`)
      .set('authorization', bearer('employer-admin-a'))
      .expect(403);
    await request(httpServer)
      .patch(`/api/v1/employers/${employerBId}/employees/${employeeBId}`)
      .set('authorization', bearer('employer-admin-a'))
      .send({ jobTitle: 'Unauthorized change' })
      .expect(403);

    await request(httpServer)
      .get(`/api/v1/employers/${employerAId}/employees/${employeeBId}`)
      .set('authorization', bearer('employer-admin-a'))
      .expect(404);
    await request(httpServer)
      .post(`/api/v1/employers/${employerAId}/employees/${employeeBId}/deactivate`)
      .set('authorization', bearer('employer-admin-a'))
      .expect(404);
    await request(httpServer)
      .delete(`/api/v1/employers/${employerAId}/admins/${employerBAdminMembershipId}`)
      .set('authorization', bearer('employer-admin-a'))
      .expect(404);
  });

  it('prevents tenant administrators from probing global user IDs', async () => {
    const missingUserId = randomUUID();
    const employerExisting = await request(httpServer)
      .post(`/api/v1/employers/${employerAId}/admins`)
      .set('authorization', bearer('employer-admin-a'))
      .send({ userId: user('employer-assignable').id })
      .expect(403);
    const employerMissing = await request(httpServer)
      .post(`/api/v1/employers/${employerAId}/admins`)
      .set('authorization', bearer('employer-admin-a'))
      .send({ userId: missingUserId })
      .expect(403);
    expect(employerExisting.body as unknown).toMatchObject({
      error: { code: 'AUTHORIZATION_DENIED' },
    });
    expect(employerMissing.body as unknown).toMatchObject({
      error: { code: 'AUTHORIZATION_DENIED' },
    });

    const employeeExisting = await request(httpServer)
      .post(`/api/v1/employers/${employerAId}/employees`)
      .set('authorization', bearer('employer-admin-a'))
      .send({
        userId: user('employee-assignable').id,
        email: user('employee-assignable').email,
        firstName: 'Linked',
        lastName: 'Existing',
      })
      .expect(403);
    const employeeMissing = await request(httpServer)
      .post(`/api/v1/employers/${employerAId}/employees`)
      .set('authorization', bearer('employer-admin-a'))
      .send({
        userId: missingUserId,
        email: `${prefix}-missing-account@example.com`,
        firstName: 'Linked',
        lastName: 'Missing',
      })
      .expect(403);
    expect(employeeExisting.body as unknown).toMatchObject({
      error: { code: 'AUTHORIZATION_DENIED' },
    });
    expect(employeeMissing.body as unknown).toMatchObject({
      error: { code: 'AUTHORIZATION_DENIED' },
    });

    const providerExisting = await request(httpServer)
      .post(`/api/v1/providers/${providerAId}/members`)
      .set('authorization', bearer('provider-admin-a'))
      .send({ userId: user('provider-assignable').id, role: ProviderMembershipRole.STAFF })
      .expect(403);
    const providerMissing = await request(httpServer)
      .post(`/api/v1/providers/${providerAId}/members`)
      .set('authorization', bearer('provider-admin-a'))
      .send({ userId: missingUserId, role: ProviderMembershipRole.STAFF })
      .expect(403);
    expect(providerExisting.body as unknown).toMatchObject({
      error: { code: 'AUTHORIZATION_DENIED' },
    });
    expect(providerMissing.body as unknown).toMatchObject({
      error: { code: 'AUTHORIZATION_DENIED' },
    });

    await request(httpServer)
      .post(`/api/v1/employers/${employerAId}/admins`)
      .set('authorization', bearer('platform'))
      .send({ userId: user('employer-assignable').id })
      .expect(201);
    await request(httpServer)
      .post(`/api/v1/providers/${providerAId}/members`)
      .set('authorization', bearer('platform'))
      .send({ userId: user('provider-assignable').id, role: ProviderMembershipRole.STAFF })
      .expect(201);
    await request(httpServer)
      .post(`/api/v1/employers/${employerAId}/employees`)
      .set('authorization', bearer('platform'))
      .send({
        userId: user('employee-assignable').id,
        email: user('employee-assignable').email,
        firstName: 'Platform',
        lastName: 'Linked',
      })
      .expect(201);
  });

  it('requires employee resource ownership in addition to the employee tenant role', async () => {
    await request(httpServer)
      .get(`/api/v1/employers/${employerAId}/employees/${employeeAId}`)
      .set('authorization', bearer('employee-a'))
      .expect(200);
    await request(httpServer)
      .get(`/api/v1/employers/${employerAId}/employees/${unlinkedEmployeeAId}`)
      .set('authorization', bearer('employee-a'))
      .expect(404);
    await request(httpServer)
      .get(`/api/v1/employers/${employerAId}/employees`)
      .set('authorization', bearer('employee-a'))
      .expect(403);

    await request(httpServer)
      .post(`/api/v1/employers/${employerAId}/employees/${employeeAId}/deactivate`)
      .set('authorization', bearer('employer-admin-a'))
      .expect(200);
    await request(httpServer)
      .get(`/api/v1/employers/${employerAId}/employees/${employeeAId}`)
      .set('authorization', bearer('employee-a'))
      .expect(403);
    await request(httpServer)
      .post(`/api/v1/employers/${employerAId}/employees/${employeeAId}/activate`)
      .set('authorization', bearer('employer-admin-a'))
      .expect(200);
    await request(httpServer)
      .get(`/api/v1/employers/${employerAId}/employees/${employeeAId}`)
      .set('authorization', bearer('employee-a'))
      .expect(200);
  });

  it('updates typed employer settings and blocks tenant access while deactivated', async () => {
    await request(httpServer)
      .patch(`/api/v1/employers/${employerAId}/settings`)
      .set('authorization', bearer('employer-admin-a'))
      .send({ defaultCurrency: 'USD', timezone: 'America/New_York' })
      .expect(200)
      .expect(({ body }) => {
        expect(body as unknown).toMatchObject({
          employerId: employerAId,
          defaultCurrency: 'USD',
          timezone: 'America/New_York',
        });
        expect(body as Record<string, unknown>).not.toHaveProperty('id');
      });

    await request(httpServer)
      .post(`/api/v1/admin/employers/${employerAId}/deactivate`)
      .set('authorization', bearer('platform'))
      .expect(200);
    await request(httpServer)
      .get(`/api/v1/employers/${employerAId}`)
      .set('authorization', bearer('employer-admin-a'))
      .expect(403);
    await request(httpServer)
      .get(`/api/v1/employers/${employerAId}`)
      .set('authorization', bearer('platform'))
      .expect(200);
    await request(httpServer)
      .post(`/api/v1/admin/employers/${employerAId}/activate`)
      .set('authorization', bearer('platform'))
      .expect(200);
  });

  it('prevents Provider A from accessing Provider B resources and repeats ownership checks', async () => {
    await request(httpServer)
      .get(`/api/v1/providers/${providerBId}`)
      .set('authorization', bearer('provider-admin-a'))
      .expect(403);
    await request(httpServer)
      .patch(`/api/v1/providers/${providerBId}/members/${providerBAdminMembershipId}`)
      .set('authorization', bearer('provider-admin-a'))
      .send({ role: ProviderMembershipRole.STAFF })
      .expect(403);
    await request(httpServer)
      .patch(`/api/v1/providers/${providerAId}/members/${providerBAdminMembershipId}`)
      .set('authorization', bearer('provider-admin-a'))
      .send({ role: ProviderMembershipRole.STAFF })
      .expect(404);
    await request(httpServer)
      .delete(`/api/v1/providers/${providerAId}/members/${providerBAdminMembershipId}`)
      .set('authorization', bearer('provider-admin-a'))
      .expect(404);
  });

  it('validates tenant existence before applying platform-admin bypass', async () => {
    const missingEmployerId = randomUUID();
    const missingProviderId = randomUUID();
    await request(httpServer)
      .get(`/api/v1/employers/${missingEmployerId}/employees`)
      .set('authorization', bearer('platform'))
      .expect(404)
      .expect(({ body }) => {
        expect(body as unknown).toMatchObject({ error: { code: 'EMPLOYER_NOT_FOUND' } });
      });
    await request(httpServer)
      .get(`/api/v1/providers/${missingProviderId}/members`)
      .set('authorization', bearer('platform'))
      .expect(404)
      .expect(({ body }) => {
        expect(body as unknown).toMatchObject({ error: { code: 'PROVIDER_NOT_FOUND' } });
      });
  });

  it('lets provider staff read their provider but not manage settings or memberships', async () => {
    await request(httpServer)
      .get(`/api/v1/providers/${providerAId}`)
      .set('authorization', bearer('provider-staff-a'))
      .expect(200);
    await request(httpServer)
      .patch(`/api/v1/providers/${providerAId}`)
      .set('authorization', bearer('provider-staff-a'))
      .send({ businessName: 'Unauthorized rename' })
      .expect(403);
    await request(httpServer)
      .post(`/api/v1/providers/${providerAId}/members`)
      .set('authorization', bearer('provider-staff-a'))
      .send({ userId: user('assignable').id, role: ProviderMembershipRole.ADMIN })
      .expect(403);

    await request(httpServer)
      .delete(`/api/v1/providers/${providerAId}/members/${providerAStaffMembershipId}`)
      .set('authorization', bearer('provider-admin-a'))
      .expect(204);
    await request(httpServer)
      .get(`/api/v1/providers/${providerAId}`)
      .set('authorization', bearer('provider-staff-a'))
      .expect(403);
    await request(httpServer)
      .post(`/api/v1/providers/${providerAId}/members/${providerAStaffMembershipId}/activate`)
      .set('authorization', bearer('provider-admin-a'))
      .expect(200);
    await request(httpServer)
      .get(`/api/v1/providers/${providerAId}`)
      .set('authorization', bearer('provider-staff-a'))
      .expect(200);
  });

  it('publishes Phase 3 routes and request schemas in OpenAPI', async () => {
    const response = await request(httpServer).get('/docs-json').expect(200);
    const document = response.body as {
      paths: Record<string, unknown>;
      components: { schemas: Record<string, { properties?: Record<string, unknown> }> };
    };
    expect(document.paths).toHaveProperty('/api/v1/admin/employers');
    expect(document.paths).toHaveProperty('/api/v1/employers/{employerId}/employees');
    expect(document.paths).toHaveProperty('/api/v1/providers/{providerId}/members');
    expect(document.components.schemas.CreateEmployerDto?.properties).toHaveProperty(
      'initialAdminUserId',
    );
    expect(document.components.schemas.CreateEmployeeDto?.properties).toHaveProperty('email');
    expect(document.components.schemas.CreateProviderDto?.properties).toHaveProperty(
      'commissionRateBps',
    );
  });
});
