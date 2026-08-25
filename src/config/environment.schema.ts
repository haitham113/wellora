import { z } from 'zod';

const postgresUrl = z.url().refine(
  (value) => {
    const protocol = new URL(value).protocol;
    return protocol === 'postgres:' || protocol === 'postgresql:';
  },
  { message: 'must use the postgres or postgresql protocol' },
);

const redisUrl = z.url().refine(
  (value) => {
    const protocol = new URL(value).protocol;
    return protocol === 'redis:' || protocol === 'rediss:';
  },
  { message: 'must use the redis or rediss protocol' },
);

const secret = z.string().min(32, 'must contain at least 32 characters');

const corsOrigins = z
  .string()
  .min(1)
  .refine(
    (value) =>
      value.split(',').every((origin) => {
        try {
          const protocol = new URL(origin.trim()).protocol;
          return protocol === 'http:' || protocol === 'https:';
        } catch {
          return false;
        }
      }),
    { message: 'must contain comma-separated HTTP(S) origins' },
  );

export const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  CORS_ORIGINS: corsOrigins.default('http://localhost:3000'),
  DATABASE_URL: postgresUrl,
  DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  DB_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(100).max(30_000).default(3000),
  REDIS_URL: redisUrl,
  REDIS_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(100).max(30_000).default(3000),
  JWT_ACCESS_SECRET: secret,
  JWT_ISSUER: z.string().min(1).default('wellora-marketplace'),
  JWT_AUDIENCE: z.string().min(1).default('wellora-api'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().min(3600).max(7_776_000).default(2_592_000),
  PASSWORD_RESET_TTL_SECONDS: z.coerce.number().int().min(300).max(3600).default(900),
  EMAIL_VERIFICATION_TTL_SECONDS: z.coerce.number().int().min(900).max(604_800).default(86_400),
  ARGON2_MEMORY_COST_KIB: z.coerce.number().int().min(19_456).max(262_144).default(19_456),
  ARGON2_TIME_COST: z.coerce.number().int().min(2).max(10).default(2),
  ARGON2_PARALLELISM: z.coerce.number().int().min(1).max(4).default(1),
  AUTH_METADATA_SECRET: secret,
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(100).default(10),
  AUTH_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(10).max(3600).default(60),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
  SWAGGER_ENABLED: z.stringbool().default(true),
});

export type EnvironmentVariables = z.infer<typeof environmentSchema>;

export function validateEnvironment(input: Record<string, unknown>): EnvironmentVariables {
  const result = environmentSchema.safeParse(input);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
      .join('; ');

    throw new Error(`Environment validation failed: ${issues}`);
  }

  return result.data;
}
