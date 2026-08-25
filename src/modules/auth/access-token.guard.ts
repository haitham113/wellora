import { HttpStatus, type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { AuthenticatedRequest } from '../../common/auth/authenticated-request.js';
import { IS_PUBLIC_KEY } from '../../common/auth/public.decorator.js';
import { ApplicationException } from '../../common/exceptions/application.exception.js';
import { AccountStatus } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { AccessTokenService } from './access-token.service.js';

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly accessTokens: AccessTokenService,
    private readonly database: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(request.headers.authorization);
    const claims = token === null ? null : await this.accessTokens.verify(token);
    if (claims === null) {
      throw this.unauthorized();
    }

    const now = new Date();
    const session = await this.database.authSession.findUnique({
      where: { id: claims.sid },
      include: { user: true },
    });
    if (session === null) {
      throw this.unauthorized();
    }
    if (session.userId !== claims.sub || session.revokedAt !== null || session.expiresAt <= now) {
      throw this.unauthorized();
    }
    if (session.user.status !== AccountStatus.ACTIVE) {
      throw new ApplicationException(HttpStatus.FORBIDDEN, {
        code: 'ACCOUNT_UNAVAILABLE',
        message: 'This account is not available for authentication.',
        details: null,
      });
    }

    request.auth = {
      userId: session.userId,
      sessionId: session.id,
      platformRole: session.user.platformRole,
    };

    const staleBefore = new Date(now.getTime() - 5 * 60 * 1000);
    if (session.lastSeenAt < staleBefore) {
      await this.database.authSession.updateMany({
        where: { id: session.id, revokedAt: null, lastSeenAt: { lt: staleBefore } },
        data: { lastSeenAt: now },
      });
    }

    return true;
  }

  private extractBearerToken(header: string | undefined): string | null {
    if (header === undefined) {
      return null;
    }
    const [scheme, token, extra] = header.split(' ');
    return scheme === 'Bearer' && token !== undefined && token.length > 0 && extra === undefined
      ? token
      : null;
  }

  private unauthorized(): ApplicationException {
    return new ApplicationException(HttpStatus.UNAUTHORIZED, {
      code: 'AUTHENTICATION_REQUIRED',
      message: 'A valid access token is required.',
      details: null,
    });
  }
}
