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
const jwtPreviousKeys = z.preprocess(
  (value) => {
    if (value === undefined || value === '') {
      return {};
    }
    if (typeof value !== 'string') {
      return value;
    }

    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value;
    }
  },
  z.record(z.string().regex(/^[A-Za-z0-9._-]{1,64}$/), secret).default({}),
);

function looksLikePlaceholder(value: string): boolean {
  return /(?:replace[-_ ]with|change[-_ ]me|example|test[-_ ])/i.test(value);
}

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

export const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    CORS_ORIGINS: corsOrigins.default('http://localhost:3000'),
    DATABASE_URL: postgresUrl,
    DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
    DB_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(100).max(30_000).default(3000),
    REDIS_URL: redisUrl,
    REDIS_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(100).max(30_000).default(3000),
    JWT_ACCESS_KEY_ID: z
      .string()
      .regex(/^[A-Za-z0-9._-]{1,64}$/)
      .default('current'),
    JWT_ACCESS_SECRET: secret,
    JWT_ACCESS_PREVIOUS_KEYS: jwtPreviousKeys,
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
    AUTH_RATE_LIMIT_IP_MAX: z.coerce.number().int().min(10).max(10_000).default(100),
    AUTH_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(10).max(3600).default(60),
    AUTH_PUBLIC_RESPONSE_MIN_MS: z.coerce.number().int().min(50).max(2000).default(150),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
    SWAGGER_ENABLED: z.stringbool().default(true),
  })
  .superRefine((environment, context) => {
    const previousSecrets = Object.values(environment.JWT_ACCESS_PREVIOUS_KEYS);
    if (environment.JWT_ACCESS_KEY_ID in environment.JWT_ACCESS_PREVIOUS_KEYS) {
      context.addIssue({
        code: 'custom',
        path: ['JWT_ACCESS_PREVIOUS_KEYS'],
        message: 'must not contain the active JWT key ID',
      });
    }
    if (
      environment.JWT_ACCESS_SECRET === environment.AUTH_METADATA_SECRET ||
      previousSecrets.includes(environment.AUTH_METADATA_SECRET)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['AUTH_METADATA_SECRET'],
        message: 'must be independent from every JWT signing key',
      });
    }
    if (
      new Set([environment.JWT_ACCESS_SECRET, ...previousSecrets]).size !==
      1 + previousSecrets.length
    ) {
      context.addIssue({
        code: 'custom',
        path: ['JWT_ACCESS_PREVIOUS_KEYS'],
        message: 'must contain unique JWT signing secrets',
      });
    }
    if (environment.NODE_ENV === 'production') {
      const productionSecrets = [
        environment.JWT_ACCESS_SECRET,
        environment.AUTH_METADATA_SECRET,
        ...previousSecrets,
      ];
      if (productionSecrets.some(looksLikePlaceholder)) {
        context.addIssue({
          code: 'custom',
          path: ['JWT_ACCESS_SECRET'],
          message: 'production secrets must not use example, test, or placeholder values',
        });
      }
    }
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
