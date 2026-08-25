import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'supertest';

import { AppModule } from '../../src/app.module.js';
import { configureApplication } from '../../src/bootstrap.js';
import type { EnvironmentVariables } from '../../src/config/environment.schema.js';
import { AccountStatus, OneTimeTokenType } from '../../src/generated/prisma/enums.js';
import type { User } from '../../src/generated/prisma/client.js';
import { PrismaService } from '../../src/infrastructure/database/prisma.service.js';
import { OneTimeTokenService } from '../../src/modules/auth/one-time-token.service.js';
import { PasswordHasher } from '../../src/modules/auth/password-hasher.service.js';
import { setupSwagger } from '../../src/swagger.js';

interface TokenPairBody {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  user: { id: string; email: string };
}

describe('identity API (e2e)', () => {
  let app: INestApplication;
  let httpServer: Server;
  let database: PrismaService;
  let passwordHasher: PasswordHasher;
  let oneTimeTokens: OneTimeTokenService;
  const emailPrefix = `p2e2e-${randomUUID().slice(0, 8)}`;
  const originalPassword = 'correct horse battery staple';

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    const config = app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);
    configureApplication(app, config);
    setupSwagger(app, config);
    await app.init();
    httpServer = app.getHttpServer() as Server;
    database = app.get(PrismaService);
    passwordHasher = app.get(PasswordHasher);
    oneTimeTokens = app.get(OneTimeTokenService);
  });

  afterAll(async () => {
    await database.user.deleteMany({
      where: { normalizedEmail: { startsWith: emailPrefix } },
    });
    await app.close();
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
        passwordHash: await passwordHasher.hash(originalPassword),
        status,
        ...(status === AccountStatus.ACTIVE ? { emailVerifiedAt: new Date() } : {}),
      },
    });
  }

  async function login(
    email: string,
    password = originalPassword,
    deviceName = 'Test laptop',
  ): Promise<TokenPairBody> {
    const response = await request(httpServer)
      .post('/api/v1/auth/login')
      .set('user-agent', 'Wellora e2e client')
      .send({ email, password, deviceName })
      .expect(200);
    return response.body as TokenPairBody;
  }

  it('logs in, returns safe tokens, and exposes the current account and device session', async () => {
    const user = await createUser('login');
    const tokens = await login(user.email.toUpperCase());

    expect(tokens.accessToken.split('.')).toHaveLength(3);
    expect(tokens.refreshToken).toMatch(/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(tokens)).not.toContain('passwordHash');

    const me = await request(httpServer)
      .get('/api/v1/me')
      .set('authorization', `Bearer ${tokens.accessToken}`)
      .expect(200);
    expect(me.body as unknown).toMatchObject({ id: user.id, email: user.email });

    const sessions = await request(httpServer)
      .get('/api/v1/auth/sessions')
      .set('authorization', `Bearer ${tokens.accessToken}`)
      .expect(200);
    expect(sessions.body as unknown).toEqual([
      expect.objectContaining({
        deviceName: 'Test laptop',
        userAgent: 'Wellora e2e client',
        current: true,
      }),
    ]);
  });

  it('returns a generic credential error and strictly rejects unknown fields', async () => {
    const user = await createUser('invalid-credentials');
    const wrongPassword = await request(httpServer)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'wrong' })
      .expect(401);
    const missingUser = await request(httpServer)
      .post('/api/v1/auth/login')
      .send({ email: `${emailPrefix}-missing@example.com`, password: 'wrong' })
      .expect(401);

    const wrongPasswordBody = wrongPassword.body as { error: { code: string; message: string } };
    const missingUserBody = missingUser.body as { error: { code: string; message: string } };
    expect(wrongPasswordBody.error).toMatchObject({
      code: 'INVALID_CREDENTIALS',
      message: 'The email or password is incorrect.',
    });
    expect(missingUserBody.error).toMatchObject({
      code: 'INVALID_CREDENTIALS',
      message: 'The email or password is incorrect.',
    });

    await request(httpServer)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: originalPassword, unexpected: true })
      .expect(400)
      .expect(({ body }) => {
        const responseBody = body as { error: { code: string } };
        expect(responseBody.error).toMatchObject({ code: 'VALIDATION_FAILED' });
      });
  });

  it('blocks pending, suspended, and dynamically suspended accounts', async () => {
    const pending = await createUser('pending', AccountStatus.PENDING_VERIFICATION);
    const suspended = await createUser('suspended', AccountStatus.SUSPENDED);

    for (const user of [pending, suspended]) {
      await request(httpServer)
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: originalPassword })
        .expect(403);
    }

    const active = await createUser('later-suspended');
    const tokens = await login(active.email);
    await database.user.update({
      where: { id: active.id },
      data: { status: AccountStatus.SUSPENDED },
    });
    await request(httpServer)
      .get('/api/v1/me')
      .set('authorization', `Bearer ${tokens.accessToken}`)
      .expect(403);
  });

  it('rotates refresh tokens and revokes the session when the previous token is replayed', async () => {
    const user = await createUser('refresh');
    const initial = await login(user.email);
    const rotatedResponse = await request(httpServer)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: initial.refreshToken })
      .expect(200);
    const rotated = rotatedResponse.body as TokenPairBody;

    expect(rotated.refreshToken).not.toBe(initial.refreshToken);
    await request(httpServer)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: initial.refreshToken })
      .expect(401);
    await request(httpServer)
      .get('/api/v1/me')
      .set('authorization', `Bearer ${rotated.accessToken}`)
      .expect(401);
  });

  it('makes logout and logout-all invalidate access and refresh tokens immediately', async () => {
    const logoutUser = await createUser('logout');
    const logoutTokens = await login(logoutUser.email);
    await request(httpServer)
      .post('/api/v1/auth/logout')
      .set('authorization', `Bearer ${logoutTokens.accessToken}`)
      .expect(204);
    await request(httpServer)
      .get('/api/v1/me')
      .set('authorization', `Bearer ${logoutTokens.accessToken}`)
      .expect(401);
    await request(httpServer)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: logoutTokens.refreshToken })
      .expect(401);

    const allUser = await createUser('logout-all');
    const first = await login(allUser.email, originalPassword, 'First device');
    const second = await login(allUser.email, originalPassword, 'Second device');
    await request(httpServer)
      .post('/api/v1/auth/logout-all')
      .set('authorization', `Bearer ${first.accessToken}`)
      .expect(204);
    for (const token of [first.accessToken, second.accessToken]) {
      await request(httpServer)
        .get('/api/v1/me')
        .set('authorization', `Bearer ${token}`)
        .expect(401);
    }
  });

  it('allows users to revoke only sessions owned by their account', async () => {
    const owner = await createUser('session-owner');
    const attacker = await createUser('session-attacker');
    const ownerTokens = await login(owner.email);
    const attackerTokens = await login(attacker.email);
    const ownerSessions = await request(httpServer)
      .get('/api/v1/auth/sessions')
      .set('authorization', `Bearer ${ownerTokens.accessToken}`)
      .expect(200);
    const ownerSessionId = (ownerSessions.body as { id: string }[])[0]?.id;
    if (ownerSessionId === undefined) {
      throw new Error('Expected the login session to be listed.');
    }

    await request(httpServer)
      .delete(`/api/v1/auth/sessions/${ownerSessionId}`)
      .set('authorization', `Bearer ${attackerTokens.accessToken}`)
      .expect(404);
    await request(httpServer)
      .get('/api/v1/me')
      .set('authorization', `Bearer ${ownerTokens.accessToken}`)
      .expect(200);

    await request(httpServer)
      .delete(`/api/v1/auth/sessions/${ownerSessionId}`)
      .set('authorization', `Bearer ${ownerTokens.accessToken}`)
      .expect(204);
    await request(httpServer)
      .get('/api/v1/me')
      .set('authorization', `Bearer ${ownerTokens.accessToken}`)
      .expect(401);
  });

  it('changes a password while retaining only the current session', async () => {
    const user = await createUser('change-password');
    const current = await login(user.email, originalPassword, 'Current');
    const other = await login(user.email, originalPassword, 'Other');
    const newPassword = 'a stronger replacement password';

    await request(httpServer)
      .post('/api/v1/auth/change-password')
      .set('authorization', `Bearer ${current.accessToken}`)
      .send({ currentPassword: originalPassword, newPassword })
      .expect(204);
    await request(httpServer)
      .get('/api/v1/me')
      .set('authorization', `Bearer ${current.accessToken}`)
      .expect(200);
    await request(httpServer)
      .get('/api/v1/me')
      .set('authorization', `Bearer ${other.accessToken}`)
      .expect(401);
    await request(httpServer)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: originalPassword })
      .expect(401);
    await login(user.email, newPassword);
  });

  it('supports non-enumerating recovery and single-use password reset', async () => {
    const user = await createUser('password-reset');
    const existing = await login(user.email);

    const known = await request(httpServer)
      .post('/api/v1/auth/forgot-password')
      .send({ email: user.email })
      .expect(202);
    const unknown = await request(httpServer)
      .post('/api/v1/auth/forgot-password')
      .send({ email: `${emailPrefix}-unknown@example.com` })
      .expect(202);
    expect(known.body).toEqual({ accepted: true });
    expect(unknown.body).toEqual({ accepted: true });

    const issued = await oneTimeTokens.issueForUser(user.id, OneTimeTokenType.PASSWORD_RESET);
    const newPassword = 'password reset replacement';
    await request(httpServer)
      .post('/api/v1/auth/reset-password')
      .send({ token: issued.token, newPassword })
      .expect(204);
    await request(httpServer)
      .get('/api/v1/me')
      .set('authorization', `Bearer ${existing.accessToken}`)
      .expect(401);
    await request(httpServer)
      .post('/api/v1/auth/reset-password')
      .send({ token: issued.token, newPassword: 'another valid replacement' })
      .expect(400);
    await login(user.email, newPassword);
  });

  it('verifies email with a single-use token and activates the account', async () => {
    const user = await createUser('email-verification', AccountStatus.PENDING_VERIFICATION);
    const issued = await oneTimeTokens.issueForUser(user.id, OneTimeTokenType.EMAIL_VERIFICATION);

    await request(httpServer)
      .post('/api/v1/auth/verify-email')
      .send({ token: issued.token })
      .expect(204);
    await request(httpServer)
      .post('/api/v1/auth/verify-email')
      .send({ token: issued.token })
      .expect(400);
    await login(user.email);
  });

  it('publishes the identity contract in OpenAPI without requiring authentication', async () => {
    const response = await request(httpServer).get('/docs-json').expect(200);
    const document = response.body as { paths: Record<string, unknown> };

    expect(document.paths).toHaveProperty('/api/v1/auth/login');
    expect(document.paths).toHaveProperty('/api/v1/auth/refresh');
    expect(document.paths).toHaveProperty('/api/v1/me');
  });
});
