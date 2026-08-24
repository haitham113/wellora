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
    ).toThrow(/must use the postgres or postgresql protocol.*must use the redis protocol/);
  });

  it('rejects wildcard or malformed CORS origins', () => {
    expect(() => validateEnvironment({ ...validEnvironment, CORS_ORIGINS: '*' })).toThrow(
      /must contain comma-separated HTTP\(S\) origins/,
    );
  });
});
