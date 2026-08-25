import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ApplicationException } from '../../common/exceptions/application.exception.js';
import type { EnvironmentVariables } from '../../config/environment.schema.js';
import { AccountStatus, type PlatformRole } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { AccessTokenService } from './access-token.service.js';
import { accountUnavailable, invalidCredentials, invalidRefreshToken } from './auth-errors.js';
import type { AuthSessionResponseDto, TokenPairResponseDto } from './dto/auth-response.dto.js';
import { PasswordHasher } from './password-hasher.service.js';
import type { SessionMetadata } from './session-metadata.service.js';
import { TokenCodec } from './token-codec.service.js';

interface SessionUser {
  id: string;
  email: string;
  status: AccountStatus;
  platformRole: PlatformRole | null;
  passwordChangedAt: Date;
}

@Injectable()
export class SessionService {
  private readonly refreshTtlSeconds: number;

  constructor(
    private readonly database: PrismaService,
    private readonly passwordHasher: PasswordHasher,
    private readonly tokenCodec: TokenCodec,
    private readonly accessTokens: AccessTokenService,
    @Inject(ConfigService) config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.refreshTtlSeconds = config.get('REFRESH_TOKEN_TTL_SECONDS', { infer: true });
  }

  async create(user: SessionUser, metadata: SessionMetadata): Promise<TokenPairResponseDto> {
    this.assertActive(user.status);

    const refreshToken = this.tokenCodec.generate();
    const secretHash = await this.passwordHasher.hash(refreshToken.secret);
    const expiresAt = this.expiryFromNow();
    const session = await this.database.$transaction(async (transaction) => {
      const lockedUsers = await transaction.$queryRaw<
        { passwordChangedAt: Date; status: AccountStatus }[]
      >`
        SELECT "password_changed_at" AS "passwordChangedAt", "status"
        FROM "users"
        WHERE "id" = ${user.id}::uuid
        FOR SHARE
      `;
      const lockedUser = lockedUsers[0];
      if (lockedUser === undefined) {
        throw invalidCredentials();
      }
      this.assertActive(lockedUser.status);
      if (lockedUser.passwordChangedAt.getTime() !== user.passwordChangedAt.getTime()) {
        throw invalidCredentials();
      }

      return transaction.authSession.create({
        data: {
          userId: user.id,
          deviceName: metadata.deviceName,
          userAgent: metadata.userAgent,
          ipHash: metadata.ipHash,
          expiresAt,
          refreshTokens: {
            create: {
              id: refreshToken.selector,
              secretHash,
              expiresAt,
            },
          },
        },
        select: { id: true },
      });
    });

    return this.buildTokenPair(user, session.id, refreshToken.value);
  }

  async rotate(rawToken: string, metadata: SessionMetadata): Promise<TokenPairResponseDto> {
    const parsed = this.tokenCodec.parse(rawToken);
    if (parsed === null) {
      throw invalidRefreshToken();
    }

    const current = await this.database.refreshToken.findUnique({
      where: { id: parsed.selector },
      include: { session: { include: { user: true } } },
    });

    if (
      current === null ||
      !(await this.passwordHasher.verify(current.secretHash, parsed.secret))
    ) {
      throw invalidRefreshToken();
    }

    const now = new Date();
    const session = current.session;
    this.assertActive(session.user.status);

    if (session.revokedAt !== null || session.expiresAt <= now || current.expiresAt <= now) {
      throw invalidRefreshToken();
    }

    if (current.consumedAt !== null || current.revokedAt !== null) {
      await this.revokeSessionForReuse(session.id, now);
      throw invalidRefreshToken();
    }

    const replacement = this.tokenCodec.generate();
    const replacementHash = await this.passwordHasher.hash(replacement.secret);
    const result = await this.database.$transaction(async (transaction) => {
      const consumed = await transaction.refreshToken.updateMany({
        where: {
          id: current.id,
          consumedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { consumedAt: now },
      });

      if (consumed.count !== 1) {
        await transaction.authSession.updateMany({
          where: { id: session.id, revokedAt: null },
          data: { revokedAt: now, revocationReason: 'REFRESH_TOKEN_REUSE' },
        });
        await transaction.refreshToken.updateMany({
          where: { sessionId: session.id, revokedAt: null },
          data: { revokedAt: now },
        });
        return { reused: true } as const;
      }

      await transaction.refreshToken.create({
        data: {
          id: replacement.selector,
          sessionId: session.id,
          secretHash: replacementHash,
          expiresAt: session.expiresAt,
        },
      });
      await transaction.refreshToken.update({
        where: { id: current.id },
        data: { replacedByTokenId: replacement.selector },
      });
      await transaction.authSession.update({
        where: { id: session.id },
        data: {
          lastSeenAt: now,
          userAgent: metadata.userAgent,
          ipHash: metadata.ipHash,
        },
      });
      return { reused: false } as const;
    });

    if (result.reused) {
      throw invalidRefreshToken();
    }

    return this.buildTokenPair(session.user, session.id, replacement.value);
  }

  async revokeCurrent(sessionId: string, reason = 'LOGOUT'): Promise<void> {
    await this.revokeSession(sessionId, reason);
  }

  async revokeAll(userId: string, reason = 'LOGOUT_ALL'): Promise<void> {
    const now = new Date();
    await this.database.$transaction([
      this.database.authSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now, revocationReason: reason },
      }),
      this.database.refreshToken.updateMany({
        where: { session: { userId }, revokedAt: null },
        data: { revokedAt: now },
      }),
    ]);
  }

  async revokeOwned(userId: string, sessionId: string): Promise<void> {
    const session = await this.database.authSession.findFirst({
      where: { id: sessionId, userId },
      select: { id: true },
    });
    if (session === null) {
      throw new ApplicationException(HttpStatus.NOT_FOUND, {
        code: 'SESSION_NOT_FOUND',
        message: 'Session not found.',
        details: null,
      });
    }

    await this.revokeSession(sessionId, 'USER_REVOKED_SESSION');
  }

  async list(userId: string, currentSessionId: string): Promise<AuthSessionResponseDto[]> {
    const sessions = await this.database.authSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: 'desc' },
      select: {
        id: true,
        deviceName: true,
        userAgent: true,
        lastSeenAt: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    return sessions.map((session) => ({
      id: session.id,
      deviceName: session.deviceName,
      userAgent: session.userAgent,
      lastSeenAt: session.lastSeenAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      createdAt: session.createdAt.toISOString(),
      current: session.id === currentSessionId,
    }));
  }

  private async buildTokenPair(
    user: SessionUser,
    sessionId: string,
    refreshToken: string,
  ): Promise<TokenPairResponseDto> {
    return {
      accessToken: await this.accessTokens.sign(user.id, sessionId),
      refreshToken,
      tokenType: 'Bearer',
      expiresInSeconds: this.accessTokens.ttlSeconds,
      user: {
        id: user.id,
        email: user.email,
        status: user.status,
        platformRole: user.platformRole,
      },
    };
  }

  private async revokeSession(sessionId: string, reason: string): Promise<void> {
    const now = new Date();
    await this.database.$transaction([
      this.database.authSession.updateMany({
        where: { id: sessionId, revokedAt: null },
        data: { revokedAt: now, revocationReason: reason },
      }),
      this.database.refreshToken.updateMany({
        where: { sessionId, revokedAt: null },
        data: { revokedAt: now },
      }),
    ]);
  }

  private revokeSessionForReuse(sessionId: string, now: Date): Promise<void> {
    return this.database.$transaction(async (transaction) => {
      await transaction.authSession.updateMany({
        where: { id: sessionId, revokedAt: null },
        data: { revokedAt: now, revocationReason: 'REFRESH_TOKEN_REUSE' },
      });
      await transaction.refreshToken.updateMany({
        where: { sessionId, revokedAt: null },
        data: { revokedAt: now },
      });
    });
  }

  private expiryFromNow(): Date {
    return new Date(Date.now() + this.refreshTtlSeconds * 1000);
  }

  private assertActive(status: AccountStatus): void {
    if (status !== AccountStatus.ACTIVE) {
      throw accountUnavailable();
    }
  }
}
