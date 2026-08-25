import { HttpStatus, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';

import { ApplicationException } from '../../common/exceptions/application.exception.js';
import { AccountStatus } from '../../generated/prisma/enums.js';
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

    return this.sessions.create(user, metadata);
  }

  async changePassword(
    userId: string,
    currentSessionId: string,
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
    await this.database.$transaction([
      this.database.user.update({
        where: { id: userId },
        data: { passwordHash, passwordChangedAt: now },
      }),
      this.database.authSession.updateMany({
        where: { userId, id: { not: currentSessionId }, revokedAt: null },
        data: { revokedAt: now, revocationReason: 'PASSWORD_CHANGED' },
      }),
      this.database.refreshToken.updateMany({
        where: { session: { userId, id: { not: currentSessionId } }, revokedAt: null },
        data: { revokedAt: now },
      }),
    ]);
  }
}

export function normalizeEmail(email: string): string {
  return email.normalize('NFKC').trim().toLowerCase();
}
