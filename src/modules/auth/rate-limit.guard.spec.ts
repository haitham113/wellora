import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Reflector } from '@nestjs/core';

import type { EnvironmentVariables } from '../../config/environment.schema.js';
import type { RedisService } from '../../infrastructure/redis/redis.service.js';
import { RateLimitGuard } from './rate-limit.guard.js';

function createContext(setHeader: jest.Mock): ExecutionContext {
  class TestController {
    readonly marker = true;
  }

  return {
    getHandler: () =>
      function handler() {
        return true;
      },
    getClass: () => TestController,
    switchToHttp: () => ({
      getRequest: () => ({ ip: '127.0.0.1', socket: {}, headers: {} }),
      getResponse: () => ({ setHeader }),
    }),
  } as unknown as ExecutionContext;
}

describe('RateLimitGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn(() => 'login'),
  } as unknown as Reflector;
  const consume = jest.fn<
    Promise<{ count: number; ttlSeconds: number }>,
    [key: string, windowSeconds: number]
  >(() => Promise.resolve({ count: 1, ttlSeconds: 60 }));
  const redis = { consumeFixedWindow: consume } as unknown as RedisService;
  const config = {
    get: jest.fn((key: keyof EnvironmentVariables) => {
      const values = {
        AUTH_RATE_LIMIT_MAX: 2,
        AUTH_RATE_LIMIT_WINDOW_SECONDS: 60,
        AUTH_METADATA_SECRET: 'test-auth-metadata-secret-at-least-32-characters',
      };
      return values[key as keyof typeof values];
    }),
  } as unknown as ConfigService<EnvironmentVariables, true>;
  beforeEach(() => {
    consume.mockResolvedValue({ count: 1, ttlSeconds: 60 });
  });

  it('uses an opaque Redis key and emits rate-limit headers', async () => {
    const setHeader = jest.fn();

    await expect(
      new RateLimitGuard(reflector, redis, config).canActivate(createContext(setHeader)),
    ).resolves.toBe(true);

    expect(consume).toHaveBeenCalledWith(
      expect.stringMatching(/^wellora:auth-rate:login:[a-f0-9]{64}$/),
      60,
    );
    expect(consume.mock.calls[0]?.[0]).not.toContain('127.0.0.1');
    expect(setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', 1);
  });

  it('rejects requests over the distributed limit', async () => {
    consume.mockResolvedValue({ count: 3, ttlSeconds: 41 });

    await expect(
      new RateLimitGuard(reflector, redis, config).canActivate(createContext(jest.fn())),
    ).rejects.toMatchObject({
      status: 429,
      response: { code: 'AUTH_RATE_LIMIT_EXCEEDED' },
    });
  });

  it('fails closed if Redis cannot enforce the limit', async () => {
    consume.mockRejectedValue(new Error('redis unavailable'));

    await expect(
      new RateLimitGuard(reflector, redis, config).canActivate(createContext(jest.fn())),
    ).rejects.toMatchObject({
      status: 503,
      response: { code: 'RATE_LIMIT_UNAVAILABLE' },
    });
  });
});
