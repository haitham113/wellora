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
  ActivityLocationType,
  ActivityStatus,
  OrganizationStatus,
  ProviderMembershipRole,
} from '../../src/generated/prisma/enums.js';
import { PrismaService } from '../../src/infrastructure/database/prisma.service.js';
import { PasswordHasher } from '../../src/modules/auth/password-hasher.service.js';
import { setupSwagger } from '../../src/swagger.js';

interface TokenBody {
  accessToken: string;
}

interface SessionBody {
  id: string;
  startsAt: string;
  endsAt: string;
  localStartsAt: string;
  localEndsAt: string;
  timezone: string;
  utcOffsetMinutes: number;
  utcEndOffsetMinutes: number;
  capacity: number;
  remainingCapacity: number;
  status: string;
  version: number;
}

describe('scheduling and availability (e2e)', () => {
  let app: INestApplication;
  let httpServer: Server;
  let database: PrismaService;
  const marker = randomUUID().slice(0, 8);
  const prefix = `p5e2e-${marker}`;
  const password = 'correct horse battery staple';
  const users = new Map<string, { id: string; email: string }>();
  const tokens = new Map<string, string>();
  let providerAId: string;
  let providerBId: string;
  let categoryId: string;
  let activityId: string;
  let sessionId: string;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    const config = app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);
    configureApplication(app, config);
    setupSwagger(app, config);
    await app.init();
    httpServer = app.getHttpServer() as Server;
    database = app.get(PrismaService);
    const passwordHash = await app.get(PasswordHasher).hash(password);

    for (const name of ['provider-a', 'provider-staff', 'provider-b', 'employee']) {
      const email = `${prefix}-${name}@example.com`;
      const created = await database.user.create({
        data: {
          email,
          normalizedEmail: email,
          passwordHash,
          status: AccountStatus.ACTIVE,
          emailVerifiedAt: new Date(),
        },
        select: { id: true, email: true },
      });
      users.set(name, created);
    }

    const providerA = await database.provider.create({
      data: {
        businessName: `${prefix} London Wellness`,
        slug: `${prefix}-london`,
        normalizedSlug: `${prefix}-london`,
        status: OrganizationStatus.ACTIVE,
        country: 'GB',
        timezone: 'Europe/London',
        commissionRateBps: 1000,
        memberships: {
          create: [
            { userId: user('provider-a').id, role: ProviderMembershipRole.ADMIN },
            { userId: user('provider-staff').id, role: ProviderMembershipRole.STAFF },
          ],
        },
      },
    });
    const providerB = await database.provider.create({
      data: {
        businessName: `${prefix} Cairo Wellness`,
        slug: `${prefix}-cairo`,
        normalizedSlug: `${prefix}-cairo`,
        status: OrganizationStatus.ACTIVE,
        country: 'EG',
        timezone: 'Africa/Cairo',
        commissionRateBps: 900,
        memberships: {
          create: { userId: user('provider-b').id, role: ProviderMembershipRole.ADMIN },
        },
      },
    });
    providerAId = providerA.id;
    providerBId = providerB.id;

    const category = await database.category.create({
      data: {
        name: `${prefix} Movement`,
        slug: `${prefix}-movement`,
        normalizedSlug: `${prefix}-movement`,
      },
    });
    categoryId = category.id;
    const activity = await database.activity.create({
      data: {
        providerId: providerAId,
        categoryId,
        title: `${prefix} Yoga`,
        slug: `${prefix}-yoga`,
        normalizedSlug: `${prefix}-yoga`,
        shortDescription: 'A calm guided practice.',
        fullDescription: 'A complete guided practice for workplace wellbeing.',
        priceMinor: 2500n,
        currency: 'GBP',
        durationMinutes: 60,
        locationType: ActivityLocationType.ONSITE,
        addressLine1: '12 Wellness Street',
        city: 'London',
        normalizedCity: 'london',
        country: 'GB',
        status: ActivityStatus.PUBLISHED,
        minParticipants: 1,
        maxParticipants: 12,
        cancellationPolicy: 'Cancel at least one day before.',
        cancellationWindowMinutes: 1440,
        bookingCutoffMinutes: 120,
        publishedAt: new Date(),
      },
    });
    activityId = activity.id;

    for (const name of ['provider-a', 'provider-staff', 'provider-b', 'employee']) {
      const response = await request(httpServer)
        .post('/api/v1/auth/login')
        .send({ email: user(name).email, password })
        .expect(200);
      tokens.set(name, (response.body as TokenBody).accessToken);
    }
  });

  afterAll(async () => {
    await database.activitySession.deleteMany({ where: { activityId } });
    await database.activityScheduleTemplate.deleteMany({ where: { activityId } });
    await database.activity.deleteMany({ where: { id: activityId } });
    await database.category.deleteMany({ where: { id: categoryId } });
    await database.providerMembership.deleteMany({
      where: { providerId: { in: [providerAId, providerBId] } },
    });
    await database.provider.deleteMany({ where: { id: { in: [providerAId, providerBId] } } });
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
    if (token === undefined) throw new Error(`Missing access token ${name}.`);
    return `Bearer ${token}`;
  }

  it('creates and manages one-time sessions with provider tenant isolation', async () => {
    await request(httpServer)
      .post(`/api/v1/providers/${providerAId}/activities/${activityId}/sessions`)
      .set('authorization', bearer('provider-b'))
      .send({ localStartsAt: '2099-12-15T09:30', capacity: 10 })
      .expect(403);

    const created = await request(httpServer)
      .post(`/api/v1/providers/${providerAId}/activities/${activityId}/sessions`)
      .set('authorization', bearer('provider-staff'))
      .send({ localStartsAt: '2099-12-15T09:30', capacity: 10 })
      .expect(201);
    const body = created.body as SessionBody;
    sessionId = body.id;
    expect(body).toMatchObject({
      startsAt: '2099-12-15T09:30:00.000Z',
      endsAt: '2099-12-15T10:30:00.000Z',
      localStartsAt: '2099-12-15T09:30',
      localEndsAt: '2099-12-15T10:30',
      timezone: 'Europe/London',
      utcOffsetMinutes: 0,
      utcEndOffsetMinutes: 0,
      capacity: 10,
      remainingCapacity: 10,
      status: 'SCHEDULED',
      version: 0,
    });

    const updated = await request(httpServer)
      .patch(`/api/v1/providers/${providerAId}/sessions/${sessionId}`)
      .set('authorization', bearer('provider-a'))
      .send({ capacity: 12 })
      .expect(200);
    expect(updated.body).toMatchObject({ capacity: 12, remainingCapacity: 12, version: 1 });

    await request(httpServer)
      .patch(`/api/v1/providers/${providerAId}/sessions/${sessionId}`)
      .set('authorization', bearer('provider-a'))
      .send({})
      .expect(400)
      .expect(({ body: errorBody }) => {
        expect(errorBody).toMatchObject({ error: { code: 'SESSION_UPDATE_EMPTY' } });
      });
  });

  it('exposes only bookable employee availability and hides cancellation', async () => {
    const available = await request(httpServer)
      .get(
        `/api/v1/activities/${activityId}/sessions?from=2099-12-01T00:00:00.000Z&to=2099-12-31T23:59:59.000Z`,
      )
      .expect(200);
    expect((available.body as { data: SessionBody[] }).data.map((session) => session.id)).toContain(
      sessionId,
    );
    expect((available.body as { data: Record<string, unknown>[] }).data[0]).not.toHaveProperty(
      'bookedCount',
    );

    await request(httpServer)
      .post(`/api/v1/providers/${providerAId}/sessions/${sessionId}/cancel`)
      .set('authorization', bearer('provider-staff'))
      .send({ reason: 'Instructor unavailable' })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({ status: 'CANCELLED', version: 2 });
      });

    const afterCancellation = await request(httpServer)
      .get(
        `/api/v1/activities/${activityId}/sessions?from=2099-12-01T00:00:00.000Z&to=2099-12-31T23:59:59.000Z`,
      )
      .expect(200);
    expect(
      (afterCancellation.body as { data: SessionBody[] }).data.map((session) => session.id),
    ).not.toContain(sessionId);
  });

  it('handles DST gaps and overlaps explicitly at the HTTP boundary', async () => {
    await request(httpServer)
      .post(`/api/v1/providers/${providerAId}/activities/${activityId}/sessions`)
      .set('authorization', bearer('provider-a'))
      .send({ localStartsAt: '2099-02-30T09:30', capacity: 5 })
      .expect(400)
      .expect(({ body }) => {
        expect(body).toMatchObject({ error: { code: 'SESSION_LOCAL_TIME_INVALID' } });
      });

    await request(httpServer)
      .post(`/api/v1/providers/${providerAId}/activities/${activityId}/sessions`)
      .set('authorization', bearer('provider-a'))
      .send({ localStartsAt: '2099-03-29T01:30', capacity: 5 })
      .expect(400)
      .expect(({ body }) => {
        expect(body).toMatchObject({ error: { code: 'SESSION_LOCAL_TIME_NONEXISTENT' } });
      });

    await request(httpServer)
      .post(`/api/v1/providers/${providerAId}/activities/${activityId}/sessions`)
      .set('authorization', bearer('provider-a'))
      .send({ localStartsAt: '2099-10-25T01:30', capacity: 5 })
      .expect(400)
      .expect(({ body }) => {
        expect(body).toMatchObject({ error: { code: 'SESSION_LOCAL_TIME_AMBIGUOUS' } });
      });

    const overlap = await request(httpServer)
      .post(`/api/v1/providers/${providerAId}/activities/${activityId}/sessions`)
      .set('authorization', bearer('provider-a'))
      .send({
        localStartsAt: '2099-10-25T01:30',
        dstOverlapPolicy: 'LATER',
        capacity: 5,
      })
      .expect(201);
    expect(overlap.body).toMatchObject({
      startsAt: '2099-10-25T01:30:00.000Z',
      utcOffsetMinutes: 0,
    });
  });

  it('materializes recurring schedules idempotently and publishes Swagger contracts', async () => {
    const created = await request(httpServer)
      .post(`/api/v1/providers/${providerAId}/activities/${activityId}/schedules`)
      .set('authorization', bearer('provider-staff'))
      .send({
        localStartTime: '10:00',
        weekdays: [1, 3],
        generationStartDate: '2099-11-01',
        generationEndDate: '2099-11-14',
        capacity: 6,
      })
      .expect(201);
    const scheduleId = (created.body as { id: string }).id;

    const first = await request(httpServer)
      .post(
        `/api/v1/providers/${providerAId}/activities/${activityId}/schedules/${scheduleId}/generate`,
      )
      .set('authorization', bearer('provider-a'))
      .send({})
      .expect(200);
    const second = await request(httpServer)
      .post(
        `/api/v1/providers/${providerAId}/activities/${activityId}/schedules/${scheduleId}/generate`,
      )
      .set('authorization', bearer('provider-a'))
      .send({})
      .expect(200);
    expect((first.body as { generatedCount: number }).generatedCount).toBe(4);
    expect((second.body as { generatedCount: number }).generatedCount).toBe(0);

    const specification = await request(httpServer).get('/docs-json').expect(200);
    const paths = (specification.body as { paths: Record<string, unknown> }).paths;
    expect(paths).toHaveProperty('/api/v1/activities/{activityId}/sessions');
    expect(paths).toHaveProperty('/api/v1/providers/{providerId}/sessions/{sessionId}/cancel');
    expect(paths).toHaveProperty(
      '/api/v1/providers/{providerId}/activities/{activityId}/schedules/{scheduleId}/generate',
    );
  });
});
