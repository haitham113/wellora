import { Test, type TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';

import { AppModule } from '../../src/app.module.js';
import type { AuthPrincipal } from '../../src/common/auth/auth-principal.js';
import {
  AccountStatus,
  ActivityLocationType,
  ActivityStatus,
  OrganizationStatus,
  ProviderMembershipRole,
} from '../../src/generated/prisma/enums.js';
import { PrismaService } from '../../src/infrastructure/database/prisma.service.js';
import { ProviderActivitiesService } from '../../src/modules/activities/provider-activities.service.js';
import { PublicActivitiesService } from '../../src/modules/activities/public-activities.service.js';
import { PublicActivitySort } from '../../src/modules/activities/dto/activity-api.enums.js';
import { PasswordHasher } from '../../src/modules/auth/password-hasher.service.js';

describe('marketplace persistence (integration)', () => {
  let module: TestingModule;
  let database: PrismaService;
  let providerActivities: ProviderActivitiesService;
  let publicActivities: PublicActivitiesService;
  let principal: AuthPrincipal;
  const marker = randomUUID().slice(0, 8);
  const prefix = `p4int-${marker}`;
  let userId: string;
  let providerId: string;
  let categoryId: string;
  let activityId: string;

  beforeAll(async () => {
    module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    database = module.get(PrismaService);
    providerActivities = module.get(ProviderActivitiesService);
    publicActivities = module.get(PublicActivitiesService);
    const passwordHasher = module.get(PasswordHasher);

    const email = `${prefix}@example.com`;
    const user = await database.user.create({
      data: {
        email,
        normalizedEmail: email,
        passwordHash: await passwordHasher.hash('correct horse battery staple'),
        status: AccountStatus.ACTIVE,
        emailVerifiedAt: new Date(),
      },
    });
    userId = user.id;
    const provider = await database.provider.create({
      data: {
        businessName: `${prefix} Provider`,
        slug: `${prefix}-provider`,
        normalizedSlug: `${prefix}-provider`,
        status: OrganizationStatus.ACTIVE,
        country: 'EG',
        timezone: 'Africa/Cairo',
        commissionRateBps: 1000,
        memberships: {
          create: { userId, role: ProviderMembershipRole.ADMIN },
        },
      },
    });
    providerId = provider.id;
    const category = await database.category.create({
      data: {
        name: `${prefix} Fitness`,
        slug: `${prefix}-fitness`,
        normalizedSlug: `${prefix}-fitness`,
      },
    });
    categoryId = category.id;
    principal = { userId, sessionId: randomUUID(), platformRole: null };
  });

  afterAll(async () => {
    await database.activity.deleteMany({ where: { providerId } });
    await database.category.deleteMany({ where: { id: categoryId } });
    await database.providerMembership.deleteMany({ where: { providerId } });
    await database.provider.deleteMany({ where: { id: providerId } });
    await database.user.deleteMany({ where: { id: userId } });
    await module.close();
  });

  it('persists, publishes, and discovers an activity with integer minor-unit money', async () => {
    const draft = await providerActivities.create(principal, providerId, {
      categoryId,
      title: `${prefix} Restorative Yoga`,
      slug: `${prefix}-restorative-yoga`,
      shortDescription: 'A calm guided practice.',
      fullDescription: 'A complete guided practice for workplace wellbeing.',
      priceMinor: '2750',
      currency: 'EGP',
      durationMinutes: 60,
      locationType: ActivityLocationType.ONSITE,
      venueName: 'Wellness Room',
      addressLine1: '12 Nile Street',
      city: 'Cairo',
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
          altText: 'Yoga studio',
          displayOrder: 0,
        },
      ],
    });
    activityId = draft.id;
    expect(draft.status).toBe(ActivityStatus.DRAFT);
    expect(draft.priceMinor).toBe('2750');

    const published = await providerActivities.publish(principal, providerId, activityId);
    expect(published.status).toBe(ActivityStatus.PUBLISHED);
    expect(published.publishedAt).not.toBeNull();

    const page = await publicActivities.list({
      page: 1,
      limit: 20,
      sort: PublicActivitySort.PUBLISHED_DESC,
      search: prefix,
      city: 'CAIRO',
      currency: 'EGP',
      minPriceMinor: '2700',
      maxPriceMinor: '2800',
    });
    expect(page.data.map((activity) => activity.id)).toContain(activityId);
    expect(page.data[0]?.media).toHaveLength(1);
  });

  it('enforces publication completeness and provider-local slug uniqueness in PostgreSQL', async () => {
    await expect(
      database.activity.create({
        data: {
          providerId,
          categoryId,
          title: 'Invalid Published Activity',
          slug: `${prefix}-invalid-published`,
          normalizedSlug: `${prefix}-invalid-published`,
          status: ActivityStatus.PUBLISHED,
        },
      }),
    ).rejects.toBeDefined();

    await expect(
      database.activity.create({
        data: {
          providerId,
          categoryId,
          title: 'Duplicate Slug',
          slug: `${prefix}-restorative-yoga`,
          normalizedSlug: `${prefix}-restorative-yoga`,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('installs indexes for bounded discovery, provider lists, filters, and trigram search', async () => {
    const rows = await database.$queryRaw<{ indexname: string }[]>`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = current_schema()
        AND tablename IN ('activities', 'categories')
    `;
    const indexes = new Set(rows.map((row) => row.indexname));
    expect([...indexes]).toEqual(
      expect.arrayContaining([
        'activities_provider_id_status_created_at_id_idx',
        'activities_provider_id_status_price_minor_id_idx',
        'activities_status_published_at_id_idx',
        'activities_status_currency_price_minor_id_idx',
        'activities_status_location_published_at_id_idx',
        'activities_search_text_trgm_idx',
        'categories_is_active_display_order_name_id_idx',
        'categories_search_text_trgm_idx',
      ]),
    );
  });
});
