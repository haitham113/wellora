import { z } from 'zod';

const postgresUrl = z.url().refine(
  (value) => {
    const protocol = new URL(value).protocol;
    return protocol === 'postgres:' || protocol === 'postgresql:';
  },
  { message: 'must use the postgres or postgresql protocol' },
);

const redisUrl = z.url().refine((value) => new URL(value).protocol === 'redis:', {
  message: 'must use the redis protocol',
});

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
