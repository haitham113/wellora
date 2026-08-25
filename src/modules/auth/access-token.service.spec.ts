import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import type { EnvironmentVariables } from '../../config/environment.schema.js';
import { AccessTokenService } from './access-token.service.js';

describe('AccessTokenService', () => {
  const values = {
    JWT_ACCESS_SECRET: 'test-jwt-access-secret-at-least-32-characters',
    JWT_ACCESS_KEY_ID: 'current-v2',
    JWT_ACCESS_PREVIOUS_KEYS: {
      'previous-v1': 'previous-test-jwt-secret-at-least-32-characters',
    },
    JWT_ISSUER: 'wellora-test',
    JWT_AUDIENCE: 'wellora-api-test',
    JWT_ACCESS_TTL_SECONDS: 300,
  };
  const config = {
    get: jest.fn((key: keyof EnvironmentVariables) => values[key as keyof typeof values]),
  } as unknown as ConfigService<EnvironmentVariables, true>;
  const service = new AccessTokenService(new JwtService(), config);

  it('signs and validates only identity and session claims', async () => {
    const token = await service.sign('user-id', 'session-id');
    const claims = await service.verify(token);

    expect(claims).toEqual({ sub: 'user-id', sid: 'session-id', type: 'access' });
    const payload = new JwtService().decode<Record<string, unknown>>(token);
    expect(payload).not.toHaveProperty('email');
    expect(payload).not.toHaveProperty('roles');
    const decoded = new JwtService().decode<{ header: { kid?: string } }>(token, {
      complete: true,
    });
    expect(decoded.header.kid).toBe('current-v2');
  });

  it('rejects a token signed by another secret', async () => {
    const token = await new JwtService().signAsync(
      { sub: 'user-id', sid: 'session-id', type: 'access' },
      {
        secret: 'different-secret-at-least-32-characters-long',
        keyid: values.JWT_ACCESS_KEY_ID,
        issuer: values.JWT_ISSUER,
        audience: values.JWT_AUDIENCE,
      },
    );

    await expect(service.verify(token)).resolves.toBeNull();
  });

  it('accepts configured previous keys and rejects unknown key IDs', async () => {
    const previousToken = await new JwtService().signAsync(
      { sub: 'user-id', sid: 'session-id', type: 'access' },
      {
        secret: values.JWT_ACCESS_PREVIOUS_KEYS['previous-v1'],
        keyid: 'previous-v1',
        issuer: values.JWT_ISSUER,
        audience: values.JWT_AUDIENCE,
      },
    );
    const unknownToken = await new JwtService().signAsync(
      { sub: 'user-id', sid: 'session-id', type: 'access' },
      {
        secret: 'unknown-test-jwt-secret-at-least-32-characters',
        keyid: 'unknown',
        issuer: values.JWT_ISSUER,
        audience: values.JWT_AUDIENCE,
      },
    );

    await expect(service.verify(previousToken)).resolves.toEqual({
      sub: 'user-id',
      sid: 'session-id',
      type: 'access',
    });
    await expect(service.verify(unknownToken)).resolves.toBeNull();
  });
});
