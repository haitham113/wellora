const explicitlyTest = process.env.NODE_ENV === 'test';
require('dotenv').config({ quiet: true });

if (!explicitlyTest) {
  const databaseUrl = new URL(process.env.DATABASE_URL ?? 'postgresql://127.0.0.1/wellora');
  if (!['127.0.0.1', 'localhost'].includes(databaseUrl.hostname)) {
    throw new Error('Refusing to run tests against a non-local database without NODE_ENV=test.');
  }
}

process.env.NODE_ENV = 'test';
process.env.PORT ??= '3000';
process.env.LOG_LEVEL = 'silent';
process.env.CORS_ORIGINS ??= 'http://localhost:3000';
process.env.DATABASE_URL ??= 'postgresql://user:password@127.0.0.1:55432/wellora';
process.env.DB_POOL_MAX ??= '2';
process.env.DB_CONNECT_TIMEOUT_MS ??= '150';
process.env.REDIS_URL ??= 'redis://127.0.0.1:56379';
process.env.REDIS_CONNECT_TIMEOUT_MS ??= '150';
process.env.JWT_ACCESS_SECRET ??= 'test-jwt-access-secret-at-least-32-characters';
process.env.JWT_ISSUER ??= 'wellora-marketplace-test';
process.env.JWT_AUDIENCE ??= 'wellora-api-test';
process.env.JWT_ACCESS_TTL_SECONDS ??= '300';
process.env.REFRESH_TOKEN_TTL_SECONDS ??= '3600';
process.env.PASSWORD_RESET_TTL_SECONDS ??= '300';
process.env.EMAIL_VERIFICATION_TTL_SECONDS ??= '900';
process.env.ARGON2_MEMORY_COST_KIB ??= '19456';
process.env.ARGON2_TIME_COST ??= '2';
process.env.ARGON2_PARALLELISM ??= '1';
process.env.AUTH_METADATA_SECRET ??= 'test-auth-metadata-secret-at-least-32-characters';
process.env.AUTH_RATE_LIMIT_MAX ??= '100';
process.env.AUTH_RATE_LIMIT_WINDOW_SECONDS ??= '60';
process.env.TRUST_PROXY_HOPS ??= '0';
process.env.SWAGGER_ENABLED ??= 'true';
