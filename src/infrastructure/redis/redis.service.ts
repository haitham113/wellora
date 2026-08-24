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
      this.logger.warn({ err: error }, 'Redis connection error');
    });
  }

  async ping(): Promise<void> {
    await this.ensureConnected();
    await this.client.ping();
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
