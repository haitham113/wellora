import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { createClient } from 'redis';

import type { EnvironmentVariables } from '../../config/environment.schema.js';

@Injectable()
export class RedisService implements OnApplicationShutdown {
  private readonly client: ReturnType<typeof createClient>;
  private connectionPromise: Promise<void> | undefined;

  constructor(
    @Inject(ConfigService) config: ConfigService<EnvironmentVariables, true>,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(RedisService.name);
    this.client = createClient({
      url: config.get('REDIS_URL', { infer: true }),
      socket: {
        connectTimeout: config.get('REDIS_CONNECT_TIMEOUT_MS', { infer: true }),
        reconnectStrategy: false,
      },
    });

    this.client.on('error', (error: Error) => {
      this.logger.warn({ errorType: error.name }, 'Redis connection error');
    });
  }

  async ping(): Promise<void> {
    await this.ensureConnected();
    await this.client.ping();
  }

  async consumeFixedWindow(
    key: string,
    windowSeconds: number,
  ): Promise<{ count: number; ttlSeconds: number }> {
    await this.ensureConnected();
    const result = await this.client.eval(
      `local count = redis.call('INCR', KEYS[1])
       if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
       local ttl = redis.call('TTL', KEYS[1])
       return { count, ttl }`,
      { keys: [key], arguments: [windowSeconds.toString()] },
    );

    if (!Array.isArray(result) || result.length !== 2) {
      throw new Error('Redis returned an invalid rate-limit result.');
    }

    const [count, ttl] = result;
    if (typeof count !== 'number' || typeof ttl !== 'number') {
      throw new Error('Redis returned an invalid rate-limit result.');
    }

    return { count, ttlSeconds: Math.max(ttl, 0) };
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.client.isOpen) {
      await this.client.quit();
    }
  }

  private async ensureConnected(): Promise<void> {
    if (this.client.isReady) {
      return;
    }

    this.connectionPromise ??= this.client
      .connect()
      .then(() => undefined)
      .finally(() => {
        this.connectionPromise = undefined;
      });

    await this.connectionPromise;
  }
}
