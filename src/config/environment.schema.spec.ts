import { validateEnvironment } from './environment.schema.js';

const validEnvironment = {
  NODE_ENV: 'test',
  PORT: '3000',
  LOG_LEVEL: 'silent',
  CORS_ORIGINS: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://user:password@localhost:5432/wellora',
  DB_POOL_MAX: '10',
  DB_CONNECT_TIMEOUT_MS: '500',
  REDIS_URL: 'redis://localhost:6379',
  REDIS_CONNECT_TIMEOUT_MS: '500',
  JWT_ACCESS_SECRET: 'test-jwt-access-secret-at-least-32-characters',
  JWT_ACCESS_KEY_ID: 'test-v1',
  JWT_ACCESS_PREVIOUS_KEYS: '{}',
  AUTH_METADATA_SECRET: 'test-auth-metadata-secret-at-least-32-characters',
};

describe('validateEnvironment', () => {
  it('coerces numeric settings and returns validated configuration', () => {
    const environment = validateEnvironment(validEnvironment);

    expect(environment).toMatchObject({
      NODE_ENV: 'test',
      PORT: 3000,
      DB_POOL_MAX: 10,
      DB_CONNECT_TIMEOUT_MS: 500,
      REDIS_CONNECT_TIMEOUT_MS: 500,
    });
  });

  it('rejects missing infrastructure configuration', () => {
    expect(() => validateEnvironment({ NODE_ENV: 'test' })).toThrow(
      /Environment validation failed:.*DATABASE_URL.*REDIS_URL/,
    );
  });

  it('rejects URLs for unsupported protocols', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        DATABASE_URL: 'https://database.example.com',
        REDIS_URL: 'https://cache.example.com',
      }),
    ).toThrow(
      /must use the postgres or postgresql protocol.*must use the redis or rediss protocol/,
    );
  });

  it('accepts TLS Redis connections', () => {
    expect(
      validateEnvironment({ ...validEnvironment, REDIS_URL: 'rediss://cache.example.com' }),
    ).toHaveProperty('REDIS_URL', 'rediss://cache.example.com');
  });

  it('parses a previous JWT verification key ring', () => {
    expect(
      validateEnvironment({
        ...validEnvironment,
        JWT_ACCESS_PREVIOUS_KEYS: JSON.stringify({
          previous: 'previous-jwt-signing-secret-at-least-32-characters',
        }),
      }),
    ).toHaveProperty('JWT_ACCESS_PREVIOUS_KEYS.previous');
  });

  it('rejects shared security secrets', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        AUTH_METADATA_SECRET: validEnvironment.JWT_ACCESS_SECRET,
      }),
    ).toThrow(/must be independent from every JWT signing key/);
  });

  it('rejects example secrets in production', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'replace-with-at-least-32-random-characters',
      }),
    ).toThrow(/production secrets must not use example, test, or placeholder values/);
  });

  it('rejects wildcard or malformed CORS origins', () => {
    expect(() => validateEnvironment({ ...validEnvironment, CORS_ORIGINS: '*' })).toThrow(
      /must contain comma-separated HTTP\(S\) origins/,
    );
  });
});
