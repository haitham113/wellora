import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { randomUUID } from 'node:crypto';

import { catalogPaginationMeta } from '../../common/pagination/catalog-pagination.dto.js';
import type { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { PublicActivitiesService } from './public-activities.service.js';
import { PublicActivitySort } from './dto/activity-api.enums.js';
import { CreateActivityDto, PublicActivityListQueryDto } from './dto/activity-request.dto.js';

describe('Phase 4 activity API contract', () => {
  it('normalizes before validation and accepts only HTTPS catalog URLs', async () => {
    const input = plainToInstance(CreateActivityDto, {
      categoryId: randomUUID(),
      title: ' a ',
      slug: 'valid-slug',
      onlineUrl: 'http://example.com/activity',
    });

    const errors = await validate(input);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['title', 'onlineUrl']),
    );
  });

  it('rejects integer values outside PostgreSQL integer range', async () => {
    const input = plainToInstance(CreateActivityDto, {
      categoryId: randomUUID(),
      title: 'Valid activity',
      slug: 'valid-activity',
      cancellationWindowMinutes: 2_147_483_648,
    });

    const errors = await validate(input);

    expect(errors.map((error) => error.property)).toContain('cancellationWindowMinutes');
  });

  it('retains bounded catalog pagination and explicit public sort defaults', () => {
    const query = plainToInstance(PublicActivityListQueryDto, {});

    expect(query).toMatchObject({
      page: 1,
      limit: 20,
      sort: PublicActivitySort.PUBLISHED_DESC,
    });
    expect(catalogPaginationMeta(2, 20, true)).toEqual({
      page: 2,
      limit: 20,
      hasNextPage: true,
      hasPreviousPage: true,
    });
  });

  it('requires currency before executing a price filter or sort query', async () => {
    const service = new PublicActivitiesService({} as PrismaService);

    await expect(
      service.list({
        page: 1,
        limit: 20,
        sort: PublicActivitySort.PRICE_ASC,
      }),
    ).rejects.toMatchObject({
      response: { code: 'ACTIVITY_PRICE_CURRENCY_REQUIRED' },
    });
  });
});
