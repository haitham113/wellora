import { HttpStatus, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';

import { ApplicationException } from '../../common/exceptions/application.exception.js';
import { AccountStatus, OneTimeTokenType } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { accountUnavailable, invalidCredentials } from './auth-errors.js';
import type { TokenPairResponseDto } from './dto/auth-response.dto.js';
import { PasswordHasher } from './password-hasher.service.js';
import type { SessionMetadata } from './session-metadata.service.js';
import { SessionService } from './session.service.js';

@Injectable()
export class CredentialsService {
  private readonly dummyHash: Promise<string>;

  constructor(
    private readonly database: PrismaService,
    private readonly passwordHasher: PasswordHasher,
    private readonly sessions: SessionService,
  ) {
    this.dummyHash = this.passwordHasher.hash(randomBytes(32).toString('base64url'));
  }

  async login(
    email: string,
    password: string,
    metadata: SessionMetadata,
  ): Promise<TokenPairResponseDto> {
    const user = await this.database.user.findUnique({
      where: { normalizedEmail: normalizeEmail(email) },
    });
    const hash = user?.passwordHash ?? (await this.dummyHash);
    const passwordMatches = await this.passwordHasher.verify(hash, password);

    if (user === null || !passwordMatches) {
      throw invalidCredentials();
    }
    if (user.status !== AccountStatus.ACTIVE) {
      throw accountUnavailable();
    }

    if (this.passwordHasher.needsRehash(user.passwordHash)) {
      const upgradedHash = await this.passwordHasher.hash(password);
      await this.database.user.updateMany({
        where: { id: user.id, passwordHash: user.passwordHash },
        data: { passwordHash: upgradedHash },
      });
    }

    return this.sessions.create(user, metadata);
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.database.user.findUnique({ where: { id: userId } });
    if (user === null || !(await this.passwordHasher.verify(user.passwordHash, currentPassword))) {
      throw invalidCredentials();
    }
    if (user.status !== AccountStatus.ACTIVE) {
      throw accountUnavailable();
    }
    if (await this.passwordHasher.verify(user.passwordHash, newPassword)) {
      throw new ApplicationException(HttpStatus.BAD_REQUEST, {
        code: 'PASSWORD_REUSE_NOT_ALLOWED',
        message: 'The new password must be different from the current password.',
        details: null,
      });
    }

    const now = new Date();
    const passwordHash = await this.passwordHasher.hash(newPassword);
    await this.database.$transaction(async (transaction) => {
      const lockedUsers = await transaction.$queryRaw<
        { passwordChangedAt: Date; status: AccountStatus }[]
      >`
        SELECT "password_changed_at" AS "passwordChangedAt", "status"
        FROM "users"
        WHERE "id" = ${userId}::uuid
        FOR UPDATE
      `;
      const lockedUser = lockedUsers[0];
      if (lockedUser?.passwordChangedAt.getTime() !== user.passwordChangedAt.getTime()) {
        throw invalidCredentials();
      }
      if (lockedUser.status !== AccountStatus.ACTIVE) {
        throw accountUnavailable();
      }

      await transaction.user.update({
        where: { id: userId },
        data: { passwordHash, passwordChangedAt: now },
      });
      await transaction.authSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now, revocationReason: 'PASSWORD_CHANGED' },
      });
      await transaction.refreshToken.updateMany({
        where: { session: { userId }, revokedAt: null },
        data: { revokedAt: now },
      });
      await transaction.oneTimeToken.updateMany({
        where: {
          userId,
          type: OneTimeTokenType.PASSWORD_RESET,
          usedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: now },
      });
    });
  }
}

export function normalizeEmail(email: string): string {
  return email.normalize('NFKC').trim().toLowerCase();
}
