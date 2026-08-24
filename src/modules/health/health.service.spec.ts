import { HttpStatus } from '@nestjs/common';

import type { PrismaService } from '../../infrastructure/database/prisma.service.js';
import type { RedisService } from '../../infrastructure/redis/redis.service.js';
import { HealthService } from './health.service.js';

describe('HealthService', () => {
  const database = { ping: jest.fn(() => Promise.resolve()) };
  const redis = { ping: jest.fn(() => Promise.resolve()) };
  const service = new HealthService(
    database as unknown as PrismaService,
    redis as unknown as RedisService,
  );

  beforeEach(() => {
    database.ping.mockResolvedValue(undefined);
    redis.ping.mockResolvedValue(undefined);
  });

  it('reports process liveness without checking dependencies', () => {
    expect(service.getLiveness()).toMatchObject({ status: 'ok' });
    expect(database.ping).not.toHaveBeenCalled();
    expect(redis.ping).not.toHaveBeenCalled();
  });

  it('reports readiness when both dependencies are available', async () => {
    await expect(service.getReadiness()).resolves.toMatchObject({
      status: 'ok',
      dependencies: {
        database: { status: 'up' },
        redis: { status: 'up' },
      },
    });
  });

  it('throws a safe service-unavailable error when a dependency is down', async () => {
    database.ping.mockRejectedValue(new Error('connection details must not escape'));

    await expect(service.getReadiness()).rejects.toMatchObject({
      status: HttpStatus.SERVICE_UNAVAILABLE,
      response: {
        code: 'DEPENDENCY_UNAVAILABLE',
        message: 'One or more required dependencies are unavailable.',
      },
    });
  });
});
