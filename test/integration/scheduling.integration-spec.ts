import { Test, type TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';

import { AppModule } from '../../src/app.module.js';
import type { AuthPrincipal } from '../../src/common/auth/auth-principal.js';
import {
  AccountStatus,
  ActivityLocationType,
  ActivityStatus,
  DstGapPolicy,
  DstOverlapPolicy,
  OrganizationStatus,
  ProviderMembershipRole,
} from '../../src/generated/prisma/enums.js';
import { PrismaService } from '../../src/infrastructure/database/prisma.service.js';
import { PasswordHasher } from '../../src/modules/auth/password-hasher.service.js';
import { AvailabilityService } from '../../src/modules/scheduling/availability.service.js';
import { ProviderSessionsService } from '../../src/modules/scheduling/provider-sessions.service.js';
import { RecurringSchedulesService } from '../../src/modules/scheduling/recurring-schedules.service.js';

describe('scheduling persistence (integration)', () => {
  let module: TestingModule;
  let database: PrismaService;
  let sessions: ProviderSessionsService;
  let schedules: RecurringSchedulesService;
  let availability: AvailabilityService;
  let principal: AuthPrincipal;
  const marker = randomUUID().slice(0, 8);
  const prefix = `p5int-${marker}`;
  let userId: string;
  let providerId: string;
  let categoryId: string;
  let activityId: string;
  let oneTimeSessionId: string;

  beforeAll(async () => {
    module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    database = module.get(PrismaService);
    sessions = module.get(ProviderSessionsService);
    schedules = module.get(RecurringSchedulesService);
    availability = module.get(AvailabilityService);
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
        country: 'GB',
        timezone: 'Europe/London',
        commissionRateBps: 1000,
        memberships: { create: { userId, role: ProviderMembershipRole.ADMIN } },
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
    const activity = await database.activity.create({
      data: {
        providerId,
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
    principal = { userId, sessionId: randomUUID(), platformRole: null };
  });

  afterAll(async () => {
    await database.activitySession.deleteMany({ where: { activityId } });
    await database.activityScheduleTemplate.deleteMany({ where: { activityId } });
    await database.activity.deleteMany({ where: { id: activityId } });
    await database.category.deleteMany({ where: { id: categoryId } });
    await database.providerMembership.deleteMany({ where: { providerId } });
    await database.provider.deleteMany({ where: { id: providerId } });
    await database.user.deleteMany({ where: { id: userId } });
    await module.close();
  });

  it('materializes a one-time local session as UTC with effective cutoff and availability', async () => {
    const created = await sessions.create(principal, providerId, activityId, {
      localStartsAt: '2099-12-15T09:30',
      capacity: 10,
    });
    oneTimeSessionId = created.id;

    expect(created.startsAt).toBe('2099-12-15T09:30:00.000Z');
    expect(created.endsAt).toBe('2099-12-15T10:30:00.000Z');
    expect(created.timezone).toBe('Europe/London');
    expect(created.bookingCutoffAt).toBe('2099-12-15T07:30:00.000Z');
    expect(created.remainingCapacity).toBe(10);

    const result = await availability.list(activityId, {
      page: 1,
      limit: 20,
      from: '2099-12-01T00:00:00.000Z',
      to: '2099-12-31T23:59:59.000Z',
    });
    expect(result.data.map((session) => session.id)).toContain(created.id);
  });

  it('generates a finite weekly schedule across DST and regenerates idempotently', async () => {
    const schedule = await schedules.create(principal, providerId, activityId, {
      localStartTime: '01:30',
      weekdays: [7],
      intervalWeeks: 1,
      generationStartDate: '2099-03-22',
      generationEndDate: '2099-04-05',
      capacity: 8,
      dstOverlapPolicy: DstOverlapPolicy.EARLIER,
      dstGapPolicy: DstGapPolicy.SKIP,
    });

    const first = await schedules.generate(principal, providerId, activityId, schedule.id, {});
    const second = await schedules.generate(principal, providerId, activityId, schedule.id, {});

    expect(first.generatedCount).toBe(2);
    expect(first.skippedGapCount).toBe(1);
    expect(second.generatedCount).toBe(0);
    expect(second.skippedGapCount).toBe(1);
    const materialized = await database.activitySession.findMany({
      where: { scheduleTemplateId: schedule.id },
      orderBy: { startsAt: 'asc' },
      select: { startsAt: true, utcOffsetMinutes: true },
    });
    expect(materialized).toEqual([
      { startsAt: new Date('2099-03-22T01:30:00.000Z'), utcOffsetMinutes: 0 },
      { startsAt: new Date('2099-04-05T00:30:00.000Z'), utcOffsetMinutes: 60 },
    ]);
  });

  it('omits closed, sold-out, and catalog-hidden sessions from employee availability', async () => {
    const query = {
      page: 1,
      limit: 20,
      from: '2099-12-01T00:00:00.000Z',
      to: '2099-12-31T23:59:59.000Z',
    };
    await database.activitySession.update({
      where: { id: oneTimeSessionId },
      data: { bookedCount: 10 },
    });
    expect((await availability.list(activityId, query)).data).toHaveLength(0);

    await database.activitySession.update({
      where: { id: oneTimeSessionId },
      data: { bookedCount: 0, bookingCutoffAt: new Date('2026-01-01T00:00:00.000Z') },
    });
    expect((await availability.list(activityId, query)).data).toHaveLength(0);

    await database.activitySession.update({
      where: { id: oneTimeSessionId },
      data: { bookingCutoffAt: new Date('2099-12-15T07:30:00.000Z') },
    });
    await database.activity.update({
      where: { id: activityId },
      data: { status: ActivityStatus.PAUSED },
    });
    await expect(availability.list(activityId, query)).rejects.toMatchObject({ status: 404 });
    await database.activity.update({
      where: { id: activityId },
      data: { status: ActivityStatus.PUBLISHED },
    });
    await database.provider.update({
      where: { id: providerId },
      data: { status: OrganizationStatus.INACTIVE },
    });
    await expect(availability.list(activityId, query)).rejects.toMatchObject({ status: 404 });
    await database.provider.update({
      where: { id: providerId },
      data: { status: OrganizationStatus.ACTIVE },
    });
  });

  it('enforces time, capacity, lifecycle, and unique-start constraints in PostgreSQL', async () => {
    const existing = await database.activitySession.findUniqueOrThrow({
      where: { id: oneTimeSessionId },
    });
    await expect(
      database.activitySession.update({
        where: { id: existing.id },
        data: { bookedCount: existing.capacity + 1 },
      }),
    ).rejects.toBeDefined();
    await database.activitySession.update({
      where: { id: existing.id },
      data: { bookedCount: 2 },
    });
    await expect(
      sessions.update(principal, providerId, existing.id, { capacity: 1 }),
    ).rejects.toMatchObject({
      response: { code: 'SESSION_CAPACITY_BELOW_BOOKED_COUNT' },
    });
    await database.activitySession.update({
      where: { id: existing.id },
      data: { bookedCount: 0 },
    });
    await expect(
      database.activitySession.create({
        data: {
          activityId,
          startsAt: existing.startsAt,
          endsAt: new Date(existing.startsAt.getTime() + 60 * 60_000),
          timezone: existing.timezone,
          utcOffsetMinutes: existing.utcOffsetMinutes,
          capacity: 1,
          bookingCutoffMinutes: 0,
          bookingCutoffAt: existing.startsAt,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await expect(
      database.activitySession.create({
        data: {
          activityId,
          startsAt: new Date('2100-01-01T10:00:00.000Z'),
          endsAt: new Date('2100-01-01T10:00:00.000Z'),
          timezone: 'Europe/London',
          utcOffsetMinutes: 0,
          capacity: 1,
          bookingCutoffMinutes: 0,
          bookingCutoffAt: new Date('2100-01-01T10:00:00.000Z'),
        },
      }),
    ).rejects.toBeDefined();

    const schedule = await database.activityScheduleTemplate.findFirstOrThrow({
      where: { activityId },
      select: { id: true },
    });
    const otherActivity = await database.activity.create({
      data: {
        providerId,
        categoryId,
        title: `${prefix} Other Activity`,
        slug: `${prefix}-other-activity`,
        normalizedSlug: `${prefix}-other-activity`,
      },
    });
    try {
      await expect(
        database.activitySession.create({
          data: {
            activityId: otherActivity.id,
            scheduleTemplateId: schedule.id,
            startsAt: new Date('2100-02-01T10:00:00.000Z'),
            endsAt: new Date('2100-02-01T11:00:00.000Z'),
            timezone: 'Europe/London',
            utcOffsetMinutes: 0,
            capacity: 1,
            bookingCutoffMinutes: 0,
            bookingCutoffAt: new Date('2100-02-01T10:00:00.000Z'),
          },
        }),
      ).rejects.toBeDefined();
    } finally {
      await database.activity.delete({ where: { id: otherActivity.id } });
    }
  });

  it('installs the booking-path and provider management indexes', async () => {
    const rows = await database.$queryRaw<{ indexname: string }[]>`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = current_schema()
        AND tablename IN ('activity_sessions', 'activity_schedule_templates')
    `;
    expect(rows.map((row) => row.indexname)).toEqual(
      expect.arrayContaining([
        'activity_sessions_activity_id_starts_at_key',
        'activity_sessions_activity_id_status_starts_at_id_idx',
        'activity_sessions_status_cutoff_starts_id_idx',
        'activity_sessions_schedule_template_id_starts_at_id_idx',
        'activity_schedule_templates_activity_window_id_idx',
      ]),
    );
  });
});
