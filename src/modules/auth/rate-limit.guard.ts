import {
  HttpStatus,
  Inject,
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { createHmac } from 'node:crypto';

import { ApplicationException } from '../../common/exceptions/application.exception.js';
import type { EnvironmentVariables } from '../../config/environment.schema.js';
import { RedisService } from '../../infrastructure/redis/redis.service.js';
import { RATE_LIMIT_NAMESPACE_KEY } from './rate-limit.decorator.js';

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly max: number;
  private readonly windowSeconds: number;
  private readonly keySecret: string;

  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
    @Inject(ConfigService) config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.max = config.get('AUTH_RATE_LIMIT_MAX', { infer: true });
    this.windowSeconds = config.get('AUTH_RATE_LIMIT_WINDOW_SECONDS', { infer: true });
    this.keySecret = config.get('AUTH_METADATA_SECRET', { infer: true });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const namespace = this.reflector.getAllAndOverride<string | undefined>(
      RATE_LIMIT_NAMESPACE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (namespace === undefined) {
      return true;
    }

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const clientAddress = request.ip ?? request.socket.remoteAddress ?? 'unknown';
    const fingerprint = createHmac('sha256', this.keySecret)
      .update(clientAddress, 'utf8')
      .digest('hex');

    let result: { count: number; ttlSeconds: number };
    try {
      result = await this.redis.consumeFixedWindow(
        `wellora:auth-rate:${namespace}:${fingerprint}`,
        this.windowSeconds,
      );
    } catch {
      throw new ApplicationException(HttpStatus.SERVICE_UNAVAILABLE, {
        code: 'RATE_LIMIT_UNAVAILABLE',
        message: 'Authentication is temporarily unavailable.',
        details: null,
      });
    }

    response.setHeader('X-RateLimit-Limit', this.max);
    response.setHeader('X-RateLimit-Remaining', Math.max(this.max - result.count, 0));
    if (result.count > this.max) {
      response.setHeader('Retry-After', result.ttlSeconds);
      throw new ApplicationException(HttpStatus.TOO_MANY_REQUESTS, {
        code: 'AUTH_RATE_LIMIT_EXCEEDED',
        message: 'Too many authentication attempts. Try again later.',
        details: { retryAfterSeconds: result.ttlSeconds },
      });
    }

    return true;
  }
}
