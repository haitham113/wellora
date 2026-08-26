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
  ActivityStatus,
  OrganizationStatus,
  PlatformRole,
  ProviderMembershipRole,
} from '../../src/generated/prisma/enums.js';
import { PrismaService } from '../../src/infrastructure/database/prisma.service.js';
import { PasswordHasher } from '../../src/modules/auth/password-hasher.service.js';
import { setupSwagger } from '../../src/swagger.js';

interface TokenBody {
  accessToken: string;
}

interface ActivityBody {
  id: string;
  status: ActivityStatus;
  priceMinor: string | null;
  provider: { id: string };
  category: { id: string };
  [key: string]: unknown;
}

describe('marketplace catalog (e2e)', () => {
  let app: INestApplication;
  let httpServer: Server;
  let database: PrismaService;
  const marker = randomUUID().slice(0, 8);
  const prefix = `p4e2e-${marker}`;
  const password = 'correct horse battery staple';
  const users = new Map<string, { id: string; email: string }>();
  const tokens = new Map<string, string>();
  let providerAId: string;
  let providerBId: string;
  let categoryId: string;
  let yogaId: string;
  let meditationId: string;
  let draftId: string;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    const config = app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);
    configureApplication(app, config);
    setupSwagger(app, config);
    await app.init();
    httpServer = app.getHttpServer() as Server;
    database = app.get(PrismaService);
    const passwordHasher = app.get(PasswordHasher);
    const passwordHash = await passwordHasher.hash(password);

    for (const name of ['platform', 'provider-a', 'provider-b', 'provider-staff', 'employee']) {
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

    const providerA = await database.provider.create({
      data: {
        businessName: `${prefix} Provider Alpha`,
        slug: `${prefix}-provider-alpha`,
        normalizedSlug: `${prefix}-provider-alpha`,
        status: OrganizationStatus.ACTIVE,
        country: 'EG',
        timezone: 'Africa/Cairo',
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
        businessName: `${prefix} Provider Beta`,
        slug: `${prefix}-provider-beta`,
        normalizedSlug: `${prefix}-provider-beta`,
        status: OrganizationStatus.ACTIVE,
        country: 'GB',
        timezone: 'Europe/London',
        commissionRateBps: 800,
        memberships: {
          create: { userId: user('provider-b').id, role: ProviderMembershipRole.ADMIN },
        },
      },
    });
    providerAId = providerA.id;
    providerBId = providerB.id;

    const category = await database.category.create({
      data: {
        name: `${prefix} Wellness`,
        slug: `${prefix}-wellness`,
        normalizedSlug: `${prefix}-wellness`,
        displayOrder: 10,
      },
    });
    await database.category.create({
      data: {
        name: `${prefix} Inactive`,
        slug: `${prefix}-inactive`,
        normalizedSlug: `${prefix}-inactive`,
        isActive: false,
      },
    });
    categoryId = category.id;

    for (const name of ['platform', 'provider-a', 'provider-b', 'provider-staff', 'employee']) {
      const response = await request(httpServer)
        .post('/api/v1/auth/login')
        .send({ email: user(name).email, password })
        .expect(200);
      tokens.set(name, (response.body as TokenBody).accessToken);
    }
  });

  afterAll(async () => {
    await database.activity.deleteMany({
      where: { providerId: { in: [providerAId, providerBId] } },
    });
    await database.category.deleteMany({ where: { normalizedSlug: { startsWith: prefix } } });
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

  function completeActivity(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      categoryId,
      title: `${prefix} Restorative Yoga`,
      slug: `${prefix}-restorative-yoga`,
      shortDescription: 'A calm guided practice.',
      fullDescription: 'A complete guided practice for workplace wellbeing.',
      priceMinor: '2500',
      currency: 'EGP',
      durationMinutes: 60,
      locationType: 'ONSITE',
      venueName: 'Wellness Room',
      addressLine1: '12 Nile Street',
      city: 'Cairo',
      region: 'Cairo',
      postalCode: '11511',
      country: 'EG',
      minParticipants: 1,
      maxParticipants: 12,
      cancellationPolicy: 'Cancel at least one day before the activity.',
      cancellationWindowMinutes: 1440,
      bookingCutoffMinutes: 120,
      media: [
        {
          type: 'IMAGE',
          url: 'https://cdn.example.com/yoga.jpg',
          altText: 'A calm yoga studio',
          displayOrder: 0,
        },
      ],
      ...overrides,
    };
  }

  it('manages categories globally and publishes only complete activities', async () => {
    await request(httpServer)
      .post('/api/v1/admin/categories')
      .set('authorization', bearer('provider-a'))
      .send({ name: 'Forbidden', slug: `${prefix}-forbidden` })
      .expect(403);

    const categoryResponse = await request(httpServer)
      .post('/api/v1/admin/categories')
      .set('authorization', bearer('platform'))
      .send({ name: `${prefix} Nutrition`, slug: `${prefix}-nutrition`, displayOrder: 20 })
      .expect(201);
    const createdCategoryId = (categoryResponse.body as { id: string }).id;
    expect(createdCategoryId).toEqual(expect.any(String));

    await request(httpServer)
      .patch(`/api/v1/admin/categories/${createdCategoryId}`)
      .set('authorization', bearer('platform'))
      .send({})
      .expect(400)
      .expect(({ body }) => {
        expect(body).toMatchObject({ error: { code: 'CATEGORY_UPDATE_EMPTY' } });
      });

    const categories = await request(httpServer)
      .get(`/api/v1/categories?search=${prefix}&page=1&limit=10`)
      .expect(200);
    expect((categories.body as { data: unknown[] }).data).toHaveLength(2);
    expect((categories.body as { data: Record<string, unknown>[] }).data[0]).not.toHaveProperty(
      'isActive',
    );
    expect((categories.body as { data: Record<string, unknown>[] }).data[0]).not.toHaveProperty(
      'updatedAt',
    );

    await request(httpServer).get('/api/v1/categories?page=10001').expect(400);

    const draftResponse = await request(httpServer)
      .post(`/api/v1/providers/${providerAId}/activities`)
      .set('authorization', bearer('provider-a'))
      .send({
        categoryId,
        title: `${prefix} Incomplete Draft`,
        slug: `${prefix}-incomplete-draft`,
      })
      .expect(201);
    draftId = (draftResponse.body as ActivityBody).id;
    expect((draftResponse.body as ActivityBody).status).toBe(ActivityStatus.DRAFT);

    const normalizedValidation = await request(httpServer)
      .post(`/api/v1/providers/${providerAId}/activities`)
      .set('authorization', bearer('provider-a'))
      .send({ categoryId, title: ' a ', slug: `${prefix}-trimmed-too-short` })
      .expect(400);
    expect(normalizedValidation.body).toMatchObject({
      error: {
        code: 'VALIDATION_FAILED',
        details: { violations: [{ field: 'title', code: 'INVALID_VALUE' }] },
      },
    });

    await request(httpServer)
      .patch(`/api/v1/providers/${providerAId}/activities/${draftId}`)
      .set('authorization', bearer('provider-a'))
      .send({})
      .expect(400)
      .expect(({ body }) => {
        expect(body).toMatchObject({ error: { code: 'ACTIVITY_UPDATE_EMPTY' } });
      });

    const invalidPublish = await request(httpServer)
      .post(`/api/v1/providers/${providerAId}/activities/${draftId}/publish`)
      .set('authorization', bearer('provider-a'))
      .expect(400);
    const invalidBody = invalidPublish.body as {
      error: { code: string; details: { fields: unknown } };
    };
    expect(invalidBody.error.code).toBe('ACTIVITY_NOT_PUBLISHABLE');
    expect(Array.isArray(invalidBody.error.details.fields)).toBe(true);
  });

  it('allows staff editing, reserves publication for admins, and blocks cross-provider access', async () => {
    const yoga = await request(httpServer)
      .post(`/api/v1/providers/${providerAId}/activities`)
      .set('authorization', bearer('provider-staff'))
      .send(completeActivity())
      .expect(201);
    yogaId = (yoga.body as ActivityBody).id;

    await request(httpServer)
      .patch(`/api/v1/providers/${providerAId}/activities/${yogaId}`)
      .set('authorization', bearer('provider-b'))
      .send({ title: 'Cross-tenant edit' })
      .expect(403);

    await request(httpServer)
      .post(`/api/v1/providers/${providerAId}/activities/${yogaId}/publish`)
      .set('authorization', bearer('provider-staff'))
      .expect(403);

    await request(httpServer)
      .post(`/api/v1/providers/${providerAId}/activities/${yogaId}/publish`)
      .set('authorization', bearer('provider-a'))
      .expect(200);

    const meditation = await request(httpServer)
      .post(`/api/v1/providers/${providerBId}/activities`)
      .set('authorization', bearer('provider-b'))
      .send(
        completeActivity({
          title: `${prefix} Online Meditation`,
          slug: `${prefix}-online-meditation`,
          priceMinor: '1500',
          currency: 'GBP',
          durationMinutes: 30,
          locationType: 'ONLINE',
          venueName: null,
          addressLine1: null,
          city: null,
          region: null,
          postalCode: null,
          country: null,
          onlineUrl: 'https://meet.example.com/meditation',
          media: [],
        }),
      )
      .expect(201);
    meditationId = (meditation.body as ActivityBody).id;
    await request(httpServer)
      .post(`/api/v1/providers/${providerBId}/activities/${meditationId}/publish`)
      .set('authorization', bearer('provider-b'))
      .expect(200);
  });

  it('supports public and employee discovery, details, filters, sorting, and pagination', async () => {
    const pricePage = await request(httpServer)
      .get(`/api/v1/activities?search=${prefix}&sort=PRICE_ASC&currency=GBP&page=1&limit=1`)
      .expect(200);
    expect(pricePage.body).toMatchObject({
      data: [{ id: meditationId, priceMinor: '1500' }],
      meta: {
        page: 1,
        limit: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    });

    const employeePage = await request(httpServer)
      .get(
        `/api/v1/activities?categoryId=${categoryId}&providerId=${providerAId}` +
          '&currency=EGP&minPriceMinor=2000&maxPriceMinor=3000' +
          '&locationType=ONSITE&country=EG&city=cairo',
      )
      .set('authorization', bearer('employee'))
      .expect(200);
    expect((employeePage.body as { data: ActivityBody[] }).data.map((item) => item.id)).toEqual([
      yogaId,
    ]);

    const details = await request(httpServer).get(`/api/v1/activities/${yogaId}`).expect(200);
    expect(details.body).toMatchObject({
      id: yogaId,
      priceMinor: '2500',
      currency: 'EGP',
      provider: { id: providerAId },
      category: { id: categoryId },
    });
    expect(details.body).not.toHaveProperty('normalizedSlug');
    expect(details.body).not.toHaveProperty('searchText');
    expect(details.body).not.toHaveProperty('status');
    expect(details.body).not.toHaveProperty('createdAt');
    expect(details.body).not.toHaveProperty('updatedAt');
    expect((details.body as { provider: object }).provider).not.toHaveProperty('commissionRateBps');

    await request(httpServer).get(`/api/v1/activities/${draftId}`).expect(404);

    const managed = await request(httpServer)
      .get(`/api/v1/providers/${providerAId}/activities?status=DRAFT&page=1&limit=10`)
      .set('authorization', bearer('provider-a'))
      .expect(200);
    expect((managed.body as { data: ActivityBody[] }).data.map((item) => item.id)).toContain(
      draftId,
    );

    await request(httpServer)
      .get('/api/v1/activities?currency=EGP&minPriceMinor=3000&maxPriceMinor=1000')
      .expect(400)
      .expect(({ body }) => {
        expect(body).toMatchObject({ error: { code: 'ACTIVITY_PRICE_RANGE_INVALID' } });
      });

    await request(httpServer)
      .get('/api/v1/activities?minPriceMinor=1000')
      .expect(400)
      .expect(({ body }) => {
        expect(body).toMatchObject({ error: { code: 'ACTIVITY_PRICE_CURRENCY_REQUIRED' } });
      });
  });

  it('hides paused, archived, inactive-category, and inactive-provider activities', async () => {
    await request(httpServer)
      .post(`/api/v1/providers/${providerAId}/activities/${yogaId}/pause`)
      .set('authorization', bearer('provider-a'))
      .expect(200);
    await request(httpServer).get(`/api/v1/activities/${yogaId}`).expect(404);

    await request(httpServer)
      .post(`/api/v1/providers/${providerAId}/activities/${yogaId}/publish`)
      .set('authorization', bearer('provider-a'))
      .expect(200);

    await request(httpServer)
      .post(`/api/v1/admin/categories/${categoryId}/deactivate`)
      .set('authorization', bearer('platform'))
      .expect(200);
    await request(httpServer).get(`/api/v1/activities/${yogaId}`).expect(404);
    await request(httpServer)
      .post(`/api/v1/admin/categories/${categoryId}/activate`)
      .set('authorization', bearer('platform'))
      .expect(200);

    await request(httpServer)
      .post(`/api/v1/admin/providers/${providerAId}/deactivate`)
      .set('authorization', bearer('platform'))
      .expect(200);
    await request(httpServer).get(`/api/v1/activities/${yogaId}`).expect(404);
    await request(httpServer)
      .post(`/api/v1/admin/providers/${providerAId}/activate`)
      .set('authorization', bearer('platform'))
      .expect(200);

    await request(httpServer)
      .post(`/api/v1/providers/${providerAId}/activities/${yogaId}/archive`)
      .set('authorization', bearer('provider-a'))
      .expect(200);
    await request(httpServer)
      .post(`/api/v1/providers/${providerAId}/activities/${yogaId}/archive`)
      .set('authorization', bearer('provider-a'))
      .expect(200);
    await request(httpServer).get(`/api/v1/activities/${yogaId}`).expect(404);
    await request(httpServer)
      .post(`/api/v1/providers/${providerAId}/activities/${yogaId}/publish`)
      .set('authorization', bearer('provider-a'))
      .expect(400);
  });

  it('publishes distinct public and provider contracts with complete Phase 4 errors', async () => {
    const response = await request(httpServer).get('/docs-json').expect(200);
    const document = response.body as {
      paths: Record<string, Record<string, { responses?: Record<string, unknown> }>>;
      components: { schemas: Record<string, { properties?: Record<string, unknown> }> };
    };

    expect(document.components.schemas).toHaveProperty('PublicActivityResponseDto');
    expect(document.components.schemas).toHaveProperty('ProviderActivityResponseDto');
    expect(
      document.components.schemas.PublicActivitySummaryResponseDto?.properties,
    ).not.toHaveProperty('status');
    expect(document.components.schemas.PublicCategoryResponseDto?.properties).not.toHaveProperty(
      'isActive',
    );
    expect(
      document.paths['/api/v1/admin/categories/{categoryId}']?.patch?.responses,
    ).toHaveProperty('404');
    expect(
      document.paths['/api/v1/providers/{providerId}/activities']?.get?.responses,
    ).toHaveProperty('400');
  });
});
