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
} from '../../src/generated/prisma/enums.js';
import { PrismaService } from '../../src/infrastructure/database/prisma.service.js';
import { PasswordHasher } from '../../src/modules/auth/password-hasher.service.js';
import { setupSwagger } from '../../src/swagger.js';

interface TokenBody {
  accessToken: string;
}

interface AllowanceMutationBody {
  account: { id: string; balanceMinor: string; currency: string; version: number };
  transaction: { id: string; type: string; amountDeltaMinor: string; correlationId: string };
}

describe('allowances (e2e)', () => {
  let app: INestApplication;
  let httpServer: Server;
  let database: PrismaService;
  const prefix = `p6e2e-${randomUUID().slice(0, 8)}`;
  const password = 'correct horse battery staple';
  const users = new Map<string, { id: string; email: string }>();
  const tokens = new Map<string, string>();
  let employerAId: string;
  let employerBId: string;
  let employeeAId: string;

  beforeAll(async () => {
    const fixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = fixture.createNestApplication();
    const config = app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);
    configureApplication(app, config);
    setupSwagger(app, config);
    await app.init();
    httpServer = app.getHttpServer() as Server;
    database = app.get(PrismaService);
    const hash = await app.get(PasswordHasher).hash(password);
    for (const name of ['admin-a', 'admin-b', 'employee-a']) {
      const email = `${prefix}-${name}@example.com`;
      const user = await database.user.create({
        data: {
          email,
          normalizedEmail: email,
          passwordHash: hash,
          status: AccountStatus.ACTIVE,
          emailVerifiedAt: new Date(),
        },
      });
      users.set(name, user);
    }
    const employerA = await database.employer.create({
      data: {
        name: `${prefix} Employer A`,
        slug: `${prefix}-employer-a`,
        normalizedSlug: `${prefix}-employer-a`,
        status: OrganizationStatus.ACTIVE,
        country: 'GB',
        timezone: 'Europe/London',
        defaultCurrency: 'GBP',
        memberships: { create: { userId: user('admin-a').id, role: EmployerMembershipRole.ADMIN } },
        employees: {
          create: {
            userId: user('employee-a').id,
            email: user('employee-a').email,
            normalizedEmail: user('employee-a').email,
            firstName: 'E2E',
            lastName: 'Employee',
          },
        },
      },
      include: { employees: true },
    });
    const employee = employerA.employees[0];
    if (employee === undefined) throw new Error('Expected allowance e2e employee.');
    employerAId = employerA.id;
    employeeAId = employee.id;
    await database.employerMembership.create({
      data: {
        employerId: employerAId,
        userId: user('employee-a').id,
        role: EmployerMembershipRole.EMPLOYEE,
      },
    });
    const employerB = await database.employer.create({
      data: {
        name: `${prefix} Employer B`,
        slug: `${prefix}-employer-b`,
        normalizedSlug: `${prefix}-employer-b`,
        status: OrganizationStatus.ACTIVE,
        country: 'EG',
        timezone: 'Africa/Cairo',
        defaultCurrency: 'EGP',
        memberships: { create: { userId: user('admin-b').id, role: EmployerMembershipRole.ADMIN } },
      },
    });
    employerBId = employerB.id;

    for (const name of users.keys()) {
      const response = await request(httpServer)
        .post('/api/v1/auth/login')
        .send({ email: user(name).email, password })
        .expect(200);
      tokens.set(name, (response.body as TokenBody).accessToken);
    }
  });

  afterAll(async () => {
    await database.$executeRaw`
      TRUNCATE TABLE "audit_logs", "allowance_transactions", "allowance_accounts" CASCADE
    `;
    await database.employee.deleteMany({
      where: { employerId: { in: [employerAId, employerBId] } },
    });
    await database.employerMembership.deleteMany({
      where: { employerId: { in: [employerAId, employerBId] } },
    });
    await database.employer.deleteMany({ where: { id: { in: [employerAId, employerBId] } } });
    await database.user.deleteMany({ where: { normalizedEmail: { startsWith: prefix } } });
    await app.close();
  });

  function user(name: string): { id: string; email: string } {
    const found = users.get(name);
    if (found === undefined) throw new Error(`Missing user ${name}.`);
    return found;
  }

  function bearer(name: string): string {
    const token = tokens.get(name);
    if (token === undefined) throw new Error(`Missing token ${name}.`);
    return `Bearer ${token}`;
  }

  function allowancePath(): string {
    return `/api/v1/employers/${employerAId}/employees/${employeeAId}/allowance`;
  }

  it('protects tenant funding and validates exact money/currency contracts', async () => {
    const body = { amountMinor: '10000', currency: 'GBP', referenceId: randomUUID() };
    await request(httpServer)
      .post(`${allowancePath()}/initial-allocation`)
      .set('authorization', bearer('admin-b'))
      .send(body)
      .expect(403);
    await request(httpServer)
      .post(`${allowancePath()}/initial-allocation`)
      .set('authorization', bearer('employee-a'))
      .send(body)
      .expect(403);
    await request(httpServer)
      .post(`${allowancePath()}/initial-allocation`)
      .set('authorization', bearer('admin-a'))
      .send({ ...body, amountMinor: '100.50' })
      .expect(400);
    await request(httpServer)
      .post(`${allowancePath()}/initial-allocation`)
      .set('authorization', bearer('admin-a'))
      .send({ ...body, currency: 'EGP' })
      .expect(400)
      .expect(({ body: errorBody }) => {
        expect(errorBody).toMatchObject({ error: { code: 'ALLOWANCE_CURRENCY_MISMATCH' } });
      });
  });

  it('allocates, retries idempotently, adjusts, expires and exposes the ledger', async () => {
    const referenceId = randomUUID();
    const command = { amountMinor: '10000', currency: 'GBP', referenceId };
    const created = await request(httpServer)
      .post(`${allowancePath()}/initial-allocation`)
      .set('authorization', bearer('admin-a'))
      .set('x-request-id', 'p6-e2e-initial')
      .send(command)
      .expect(201);
    const initial = created.body as AllowanceMutationBody;
    expect(initial).toMatchObject({
      account: { balanceMinor: '10000', currency: 'GBP', version: 1 },
      transaction: {
        type: 'INITIAL_ALLOCATION',
        amountDeltaMinor: '10000',
        correlationId: 'p6-e2e-initial',
      },
    });
    const retry = await request(httpServer)
      .post(`${allowancePath()}/initial-allocation`)
      .set('authorization', bearer('admin-a'))
      .send(command)
      .expect(201);
    expect((retry.body as AllowanceMutationBody).transaction.id).toBe(initial.transaction.id);

    await request(httpServer)
      .post(`${allowancePath()}/top-ups`)
      .set('authorization', bearer('admin-a'))
      .send({ amountMinor: '2000', currency: 'GBP', referenceId: randomUUID() })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toMatchObject({ account: { balanceMinor: '12000' } });
      });
    const manual = await request(httpServer)
      .post(`${allowancePath()}/manual-adjustments`)
      .set('authorization', bearer('admin-a'))
      .set('x-request-id', 'p6-e2e-manual')
      .send({
        amountDeltaMinor: '-500',
        currency: 'GBP',
        referenceId: randomUUID(),
        reason: 'Approved correction',
      })
      .expect(201);
    const manualBody = manual.body as AllowanceMutationBody;
    await expect(
      database.auditLog.findUniqueOrThrow({
        where: { allowanceTransactionId: manualBody.transaction.id },
      }),
    ).resolves.toMatchObject({ correlationId: 'p6-e2e-manual' });
    await request(httpServer)
      .post(`${allowancePath()}/expirations`)
      .set('authorization', bearer('admin-a'))
      .send({
        amountMinor: '1000',
        currency: 'GBP',
        referenceId: randomUUID(),
        reason: 'Annual expiration',
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toMatchObject({ account: { balanceMinor: '10500' } });
      });

    const ledger = await request(httpServer)
      .get(`${allowancePath()}/transactions?limit=10`)
      .set('authorization', bearer('admin-a'))
      .expect(200);
    expect((ledger.body as { data: { type: string }[] }).data.map((entry) => entry.type)).toEqual([
      'EXPIRATION',
      'MANUAL_ADJUSTMENT',
      'TOP_UP',
      'INITIAL_ALLOCATION',
    ]);
  });

  it('allows only the linked employee to read the self-service account', async () => {
    await request(httpServer)
      .get(`/api/v1/me/allowance?employerId=${employerAId}`)
      .set('authorization', bearer('employee-a'))
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          employeeId: employeeAId,
          balanceMinor: '10500',
          currency: 'GBP',
        });
      });
    await request(httpServer)
      .get(`/api/v1/me/allowance?employerId=${employerAId}`)
      .set('authorization', bearer('admin-b'))
      .expect(404);
  });

  it('publishes the Phase 6 allowance contracts in OpenAPI', async () => {
    const response = await request(httpServer).get('/docs-json').expect(200);
    const document = response.body as {
      paths: Record<string, unknown>;
      components: { schemas: Record<string, unknown> };
    };
    expect(document.paths).toHaveProperty(
      '/api/v1/employers/{employerId}/employees/{employeeId}/allowance/initial-allocation',
    );
    expect(document.paths).toHaveProperty('/api/v1/me/allowance');
    expect(document.components.schemas).toHaveProperty('AllowanceTransactionResponseDto');
  });
});
