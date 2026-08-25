import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { EnvironmentVariables } from '../../config/environment.schema.js';
import { AccountStatus, OneTimeTokenType } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { accountUnavailable, invalidOneTimeToken } from './auth-errors.js';
import { normalizeEmail } from './credentials.service.js';
import { PasswordHasher } from './password-hasher.service.js';
import { TokenCodec } from './token-codec.service.js';

export interface IssuedOneTimeToken {
  userId: string;
  token: string;
  expiresAt: Date;
  type: OneTimeTokenType;
}

interface ResolvedOneTimeToken {
  id: string;
  userId: string;
  user: {
    status: AccountStatus;
    passwordHash: string;
  };
}

@Injectable()
export class OneTimeTokenService {
  private readonly passwordResetTtlSeconds: number;
  private readonly verificationTtlSeconds: number;

  constructor(
    private readonly database: PrismaService,
    private readonly tokenCodec: TokenCodec,
    private readonly passwordHasher: PasswordHasher,
    @Inject(ConfigService) config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.passwordResetTtlSeconds = config.get('PASSWORD_RESET_TTL_SECONDS', { infer: true });
    this.verificationTtlSeconds = config.get('EMAIL_VERIFICATION_TTL_SECONDS', {
      infer: true,
    });
  }

  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.database.user.findUnique({
      where: { normalizedEmail: normalizeEmail(email) },
      select: { id: true, status: true },
    });
    if (user === null) {
      return;
    }
    if (user.status === AccountStatus.DEACTIVATED) {
      return;
    }

    await this.issueForUser(user.id, OneTimeTokenType.PASSWORD_RESET);
  }

  async requestEmailVerification(email: string): Promise<void> {
    const user = await this.database.user.findUnique({
      where: { normalizedEmail: normalizeEmail(email) },
      select: { id: true, status: true, emailVerifiedAt: true },
    });
    if (user === null) {
      return;
    }
    if (user.status !== AccountStatus.PENDING_VERIFICATION || user.emailVerifiedAt !== null) {
      return;
    }

    await this.issueForUser(user.id, OneTimeTokenType.EMAIL_VERIFICATION);
  }

  async issueForUser(userId: string, type: OneTimeTokenType): Promise<IssuedOneTimeToken> {
    const generated = this.tokenCodec.generate();
    const ttlSeconds =
      type === OneTimeTokenType.PASSWORD_RESET
        ? this.passwordResetTtlSeconds
        : this.verificationTtlSeconds;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const now = new Date();

    await this.database.$transaction([
      this.database.oneTimeToken.updateMany({
        where: { userId, type, usedAt: null, revokedAt: null },
        data: { revokedAt: now },
      }),
      this.database.oneTimeToken.create({
        data: {
          id: generated.selector,
          userId,
          type,
          secretHash: this.tokenCodec.digest(generated.secret),
          expiresAt,
        },
      }),
    ]);

    return { userId, token: generated.value, expiresAt, type };
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const resolved = await this.resolve(rawToken, OneTimeTokenType.PASSWORD_RESET);
    if (resolved.user.status === AccountStatus.DEACTIVATED) {
      throw accountUnavailable();
    }
    if (await this.passwordHasher.verify(resolved.user.passwordHash, newPassword)) {
      throw invalidOneTimeToken();
    }

    const now = new Date();
    const passwordHash = await this.passwordHasher.hash(newPassword);
    const result = await this.database.$transaction(async (transaction) => {
      const consumed = await transaction.oneTimeToken.updateMany({
        where: {
          id: resolved.id,
          type: OneTimeTokenType.PASSWORD_RESET,
          usedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { usedAt: now },
      });
      if (consumed.count !== 1) {
        return false;
      }

      await transaction.user.update({
        where: { id: resolved.userId },
        data: { passwordHash, passwordChangedAt: now },
      });
      await transaction.authSession.updateMany({
        where: { userId: resolved.userId, revokedAt: null },
        data: { revokedAt: now, revocationReason: 'PASSWORD_RESET' },
      });
      await transaction.refreshToken.updateMany({
        where: { session: { userId: resolved.userId }, revokedAt: null },
        data: { revokedAt: now },
      });
      return true;
    });

    if (!result) {
      throw invalidOneTimeToken();
    }
  }

  async verifyEmail(rawToken: string): Promise<void> {
    const resolved = await this.resolve(rawToken, OneTimeTokenType.EMAIL_VERIFICATION);
    if (resolved.user.status === AccountStatus.DEACTIVATED) {
      throw accountUnavailable();
    }

    const now = new Date();
    const consumed = await this.database.$transaction(async (transaction) => {
      const result = await transaction.oneTimeToken.updateMany({
        where: {
          id: resolved.id,
          type: OneTimeTokenType.EMAIL_VERIFICATION,
          usedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { usedAt: now },
      });
      if (result.count !== 1) {
        return false;
      }

      await transaction.user.update({
        where: { id: resolved.userId },
        data: {
          emailVerifiedAt: now,
          ...(resolved.user.status === AccountStatus.PENDING_VERIFICATION
            ? { status: AccountStatus.ACTIVE }
            : {}),
        },
      });
      return true;
    });

    if (!consumed) {
      throw invalidOneTimeToken();
    }
  }

  private async resolve(rawToken: string, type: OneTimeTokenType): Promise<ResolvedOneTimeToken> {
    const parsed = this.tokenCodec.parse(rawToken);
    if (parsed === null) {
      throw invalidOneTimeToken();
    }

    const token = await this.database.oneTimeToken.findUnique({
      where: { id: parsed.selector },
      include: { user: true },
    });
    if (token === null) {
      throw invalidOneTimeToken();
    }
    if (
      token.type !== type ||
      token.usedAt !== null ||
      token.revokedAt !== null ||
      token.expiresAt <= new Date() ||
      !this.tokenCodec.matchesDigest(parsed.secret, token.secretHash)
    ) {
      throw invalidOneTimeToken();
    }

    return token;
  }
}
