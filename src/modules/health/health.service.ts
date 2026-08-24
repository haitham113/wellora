import { HttpStatus, Injectable } from '@nestjs/common';

import { ApplicationException } from '../../common/exceptions/application.exception.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { RedisService } from '../../infrastructure/redis/redis.service.js';

interface DependencyHealth {
  status: 'up' | 'down';
  latencyMs: number;
}

export interface LivenessResponse {
  status: 'ok';
  timestamp: string;
  uptimeSeconds: number;
}

export interface ReadinessResponse {
  status: 'ok';
  timestamp: string;
  dependencies: {
    database: DependencyHealth;
    redis: DependencyHealth;
  };
}

@Injectable()
export class HealthService {
  constructor(
    private readonly database: PrismaService,
    private readonly redis: RedisService,
  ) {}

  getLiveness(): LivenessResponse {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }

  async getReadiness(): Promise<ReadinessResponse> {
    const [database, redis] = await Promise.all([
      this.checkDependency(() => this.database.ping()),
      this.checkDependency(() => this.redis.ping()),
    ]);
    const dependencies = { database, redis };

    if (database.status === 'down' || redis.status === 'down') {
      throw new ApplicationException(HttpStatus.SERVICE_UNAVAILABLE, {
        code: 'DEPENDENCY_UNAVAILABLE',
        message: 'One or more required dependencies are unavailable.',
        details: { dependencies },
      });
    }

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      dependencies,
    };
  }

  private async checkDependency(check: () => Promise<void>): Promise<DependencyHealth> {
    const startedAt = performance.now();

    try {
      await check();
      return { status: 'up', latencyMs: Math.round(performance.now() - startedAt) };
    } catch {
      return { status: 'down', latencyMs: Math.round(performance.now() - startedAt) };
    }
  }
}
