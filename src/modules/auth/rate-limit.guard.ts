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

import type { AuthenticatedRequest } from '../../common/auth/authenticated-request.js';
import { ApplicationException } from '../../common/exceptions/application.exception.js';
import type { EnvironmentVariables } from '../../config/environment.schema.js';
import { RedisService } from '../../infrastructure/redis/redis.service.js';
import { RATE_LIMIT_NAMESPACE_KEY } from './rate-limit.decorator.js';

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly max: number;
  private readonly ipMax: number;
  private readonly windowSeconds: number;
  private readonly keySecret: string;

  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
    @Inject(ConfigService) config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.max = config.get('AUTH_RATE_LIMIT_MAX', { infer: true });
    this.ipMax = config.get('AUTH_RATE_LIMIT_IP_MAX', { infer: true });
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
    const request = http.getRequest<Request & AuthenticatedRequest>();
    const response = http.getResponse<Response>();
    const clientAddress = request.ip ?? request.socket.remoteAddress ?? 'unknown';
    const ipFingerprint = this.fingerprint(`ip:${clientAddress}`);
    const subjectFingerprint = this.fingerprint(
      `subject:${namespace}:${this.resolveSubject(request, namespace)}`,
    );

    let ipResult: { count: number; ttlSeconds: number };
    let subjectResult: { count: number; ttlSeconds: number };
    try {
      [ipResult, subjectResult] = await Promise.all([
        this.redis.consumeFixedWindow(
          `wellora:auth-rate:${namespace}:ip:${ipFingerprint}`,
          this.windowSeconds,
        ),
        this.redis.consumeFixedWindow(
          `wellora:auth-rate:${namespace}:subject:${subjectFingerprint}`,
          this.windowSeconds,
        ),
      ]);
    } catch {
      throw new ApplicationException(HttpStatus.SERVICE_UNAVAILABLE, {
        code: 'RATE_LIMIT_UNAVAILABLE',
        message: 'Authentication is temporarily unavailable.',
        details: null,
      });
    }

    response.setHeader('X-RateLimit-Limit', this.max);
    response.setHeader('X-RateLimit-Remaining', Math.max(this.max - subjectResult.count, 0));
    const ipExceeded = ipResult.count > this.ipMax;
    const subjectExceeded = subjectResult.count > this.max;
    if (ipExceeded || subjectExceeded) {
      const retryAfterSeconds = Math.max(
        ipExceeded ? ipResult.ttlSeconds : 0,
        subjectExceeded ? subjectResult.ttlSeconds : 0,
      );
      response.setHeader('Retry-After', retryAfterSeconds);
      throw new ApplicationException(HttpStatus.TOO_MANY_REQUESTS, {
        code: 'AUTH_RATE_LIMIT_EXCEEDED',
        message: 'Too many authentication attempts. Try again later.',
        details: { retryAfterSeconds },
      });
    }

    return true;
  }

  private fingerprint(value: string): string {
    return createHmac('sha256', this.keySecret).update(value, 'utf8').digest('hex');
  }

  private resolveSubject(request: Request & AuthenticatedRequest, namespace: string): string {
    if (namespace === 'change-password') {
      return request.auth?.userId ?? 'missing-principal';
    }

    const rawBody: unknown = (request as { body?: unknown }).body;
    const body = typeof rawBody === 'object' && rawBody !== null ? rawBody : {};
    if (
      namespace === 'login' ||
      namespace === 'forgot-password' ||
      namespace === 'resend-verification'
    ) {
      const email = (body as Record<string, unknown>).email;
      return typeof email === 'string'
        ? email.normalize('NFKC').trim().toLowerCase().slice(0, 320)
        : 'invalid-email';
    }

    const tokenField = namespace === 'refresh' ? 'refreshToken' : 'token';
    const token = (body as Record<string, unknown>)[tokenField];
    if (typeof token !== 'string') {
      return 'invalid-token';
    }

    return token.split('.', 1)[0]?.slice(0, 64) ?? 'invalid-token';
  }
}
