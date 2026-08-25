import { Test, type TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';

import { AppModule } from '../../src/app.module.js';
import { AccountStatus, OneTimeTokenType } from '../../src/generated/prisma/enums.js';
import type { User } from '../../src/generated/prisma/client.js';
import { PrismaService } from '../../src/infrastructure/database/prisma.service.js';
import { RedisService } from '../../src/infrastructure/redis/redis.service.js';
import { OneTimeTokenService } from '../../src/modules/auth/one-time-token.service.js';
import { PasswordHasher } from '../../src/modules/auth/password-hasher.service.js';
import type { SessionMetadata } from '../../src/modules/auth/session-metadata.service.js';
import { SessionService } from '../../src/modules/auth/session.service.js';

describe('identity persistence (integration)', () => {
  let module: TestingModule;
  let database: PrismaService;
  let passwordHasher: PasswordHasher;
  let sessions: SessionService;
  let oneTimeTokens: OneTimeTokenService;
  let redis: RedisService;
  const emailPrefix = `p2int-${randomUUID().slice(0, 8)}`;
  const metadata: SessionMetadata = {
    deviceName: 'Integration test',
    userAgent: 'Jest integration runner',
    ipHash: 'a'.repeat(64),
  };

  beforeAll(async () => {
    module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    database = module.get(PrismaService);
    passwordHasher = module.get(PasswordHasher);
    sessions = module.get(SessionService);
    oneTimeTokens = module.get(OneTimeTokenService);
    redis = module.get(RedisService);
  });

  afterAll(async () => {
    await database.user.deleteMany({
      where: { normalizedEmail: { startsWith: emailPrefix } },
    });
    await module.close();
  });

  async function createUser(
    suffix: string,
    status: AccountStatus = AccountStatus.ACTIVE,
  ): Promise<User> {
    const email = `${emailPrefix}-${suffix}@example.com`;
    return database.user.create({
      data: {
        email,
        normalizedEmail: email,
        passwordHash: await passwordHasher.hash('correct horse battery staple'),
        status,
        ...(status === AccountStatus.ACTIVE ? { emailVerifiedAt: new Date() } : {}),
      },
    });
  }

  it('enforces normalized email uniqueness in PostgreSQL', async () => {
    const user = await createUser('unique');

    await expect(
      database.user.create({
        data: {
          email: user.email.toUpperCase(),
          normalizedEmail: user.normalizedEmail,
          passwordHash: user.passwordHash,
          status: AccountStatus.ACTIVE,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('increments the Redis rate-limit window atomically', async () => {
    const key = `wellora:test-rate:${randomUUID()}`;

    await expect(redis.consumeFixedWindow(key, 60)).resolves.toMatchObject({ count: 1 });
    await expect(redis.consumeFixedWindow(key, 60)).resolves.toMatchObject({ count: 2 });
  });

  it('rotates refresh tokens, hashes secrets, and revokes the family on reuse', async () => {
    const user = await createUser('rotation');
    const original = await sessions.create(user, metadata);
    const rotated = await sessions.rotate(original.refreshToken, metadata);
    const [originalSelector, originalSecret] = original.refreshToken.split('.');
    const [replacementSelector, replacementSecret] = rotated.refreshToken.split('.');
    if (
      originalSelector === undefined ||
      originalSecret === undefined ||
      replacementSelector === undefined ||
      replacementSecret === undefined
    ) {
      throw new Error('Session service returned a malformed refresh token.');
    }

    const storedOriginal = await database.refreshToken.findUniqueOrThrow({
      where: { id: originalSelector },
    });
    const storedReplacement = await database.refreshToken.findUniqueOrThrow({
      where: { id: replacementSelector },
    });
    expect(storedOriginal.consumedAt).not.toBeNull();
    expect(storedOriginal.replacedByTokenId).toBe(replacementSelector);
    expect(storedOriginal.secretHash).not.toContain(originalSecret);
    expect(storedReplacement.secretHash).not.toContain(replacementSecret);

    await expect(sessions.rotate(original.refreshToken, metadata)).rejects.toMatchObject({
      response: { code: 'INVALID_REFRESH_TOKEN' },
    });
    const revokedSession = await database.authSession.findUniqueOrThrow({
      where: { id: storedOriginal.sessionId },
      select: { revokedAt: true, revocationReason: true },
    });
    expect(revokedSession.revokedAt).toBeInstanceOf(Date);
    expect(revokedSession.revocationReason).toBe('REFRESH_TOKEN_REUSE');
  });

  it('allows only one concurrent rotation and detects the competing reuse', async () => {
    const user = await createUser('rotation-race');
    const original = await sessions.create(user, metadata);
    const results = await Promise.allSettled([
      sessions.rotate(original.refreshToken, metadata),
      sessions.rotate(original.refreshToken, metadata),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const [selector] = original.refreshToken.split('.');
    if (selector === undefined) {
      throw new Error('Session service returned a malformed refresh token.');
    }
    const token = await database.refreshToken.findUniqueOrThrow({ where: { id: selector } });
    const revokedSession = await database.authSession.findUniqueOrThrow({
      where: { id: token.sessionId },
      select: { revokedAt: true },
    });
    expect(revokedSession.revokedAt).toBeInstanceOf(Date);
  });

  it('rejects session creation from a credential snapshot changed while issuance waits', async () => {
    const user = await createUser('credential-race');
    const nextPasswordHash = await passwordHasher.hash('replacement credential after race');
    let releaseUserLock: (() => void) | undefined;
    let signalUserLocked: (() => void) | undefined;
    const userLocked = new Promise<void>((resolve) => {
      signalUserLocked = resolve;
    });
    const lockReleased = new Promise<void>((resolve) => {
      releaseUserLock = resolve;
    });
    const credentialChange = database.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT "id" FROM "users" WHERE "id" = ${user.id}::uuid FOR UPDATE
      `;
      signalUserLocked?.();
      await lockReleased;
      await transaction.user.update({
        where: { id: user.id },
        data: {
          passwordHash: nextPasswordHash,
          passwordChangedAt: new Date(user.passwordChangedAt.getTime() + 1000),
        },
      });
    });
    await userLocked;

    const sessionAttempt = sessions.create(user, metadata);
    const sessionAssertion = expect(sessionAttempt).rejects.toMatchObject({
      response: { code: 'INVALID_CREDENTIALS' },
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    releaseUserLock?.();
    await credentialChange;

    await sessionAssertion;
    await expect(database.authSession.count({ where: { userId: user.id } })).resolves.toBe(0);
  });

  it('serializes one-time-token issuance and preserves only one active token', async () => {
    const user = await createUser('one-time-race');
    const issued = await Promise.all([
      oneTimeTokens.issueForUser(user.id, OneTimeTokenType.PASSWORD_RESET),
      oneTimeTokens.issueForUser(user.id, OneTimeTokenType.PASSWORD_RESET),
    ]);
    const stored = await database.oneTimeToken.findMany({
      where: { userId: user.id, type: OneTimeTokenType.PASSWORD_RESET },
      orderBy: { createdAt: 'asc' },
    });

    expect(stored).toHaveLength(2);
    expect(
      stored.filter((token) => token.usedAt === null && token.revokedAt === null),
    ).toHaveLength(1);
    const active = stored.find((token) => token.usedAt === null && token.revokedAt === null);
    if (active === undefined) {
      throw new Error('Expected one stored token to remain active.');
    }
    const activeIssued = issued.find((token) => token.token.startsWith(`${active.id}.`));
    if (activeIssued === undefined) {
      throw new Error('Expected one issued token to remain active.');
    }

    await oneTimeTokens.resetPassword(activeIssued.token, 'new password after issuance race');
    await expect(
      database.oneTimeToken.count({
        where: {
          userId: user.id,
          type: OneTimeTokenType.PASSWORD_RESET,
          usedAt: null,
          revokedAt: null,
        },
      }),
    ).resolves.toBe(0);
  });

  it('consumes password reset tokens once and revokes every active session', async () => {
    const user = await createUser('reset');
    await sessions.create(user, metadata);
    const issued = await oneTimeTokens.issueForUser(user.id, OneTimeTokenType.PASSWORD_RESET);

    await oneTimeTokens.resetPassword(issued.token, 'a completely new password');

    const updated = await database.user.findUniqueOrThrow({ where: { id: user.id } });
    await expect(
      passwordHasher.verify(updated.passwordHash, 'a completely new password'),
    ).resolves.toBe(true);
    await expect(
      database.authSession.count({ where: { userId: user.id, revokedAt: null } }),
    ).resolves.toBe(0);
    await expect(
      oneTimeTokens.resetPassword(issued.token, 'another secure password'),
    ).rejects.toMatchObject({ response: { code: 'INVALID_OR_EXPIRED_TOKEN' } });
  });

  it('activates a pending account with a single-use verification token', async () => {
    const user = await createUser('verify', AccountStatus.PENDING_VERIFICATION);
    const issued = await oneTimeTokens.issueForUser(user.id, OneTimeTokenType.EMAIL_VERIFICATION);

    await oneTimeTokens.verifyEmail(issued.token);

    const verifiedUser = await database.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { status: true, emailVerifiedAt: true },
    });
    expect(verifiedUser.status).toBe(AccountStatus.ACTIVE);
    expect(verifiedUser.emailVerifiedAt).toBeInstanceOf(Date);
    await expect(oneTimeTokens.verifyEmail(issued.token)).rejects.toMatchObject({
      response: { code: 'INVALID_OR_EXPIRED_TOKEN' },
    });
  });
});
