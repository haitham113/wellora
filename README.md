# Wellora Marketplace API

Wellora Marketplace is a production-style B2B employee-benefits marketplace API built as a modular monolith. The repository is being delivered phase by phase; Phase 2 adds the identity and authorization foundation. Employer, provider, and marketplace business behavior remains intentionally out of scope.

## Current capabilities

- NestJS 11 application with strict TypeScript
- Startup environment validation
- PostgreSQL access through Prisma 7 and the `pg` driver adapter
- Redis connectivity
- Structured Pino request logging with correlation IDs and sensitive-field redaction
- Separate liveness and dependency-readiness endpoints
- Reproducible Docker Compose development environment
- Jest unit/e2e test foundations and GitHub Actions CI
- Argon2id password authentication and account-status enforcement
- Short-lived JWT access tokens with database-backed session validation
- Opaque refresh-token rotation, hashed storage, and replay-family revocation
- Password recovery, email verification, logout, and device-session lifecycle
- Redis-backed rate limiting for sensitive authentication routes
- Default-deny authentication guards and tenant-safe role primitives
- Swagger/OpenAPI at `/docs`

## Runtime requirements

- Node.js 24 LTS (see `.nvmrc`)
- npm
- Docker with Docker Compose

The package also supports Node.js 22.12 or newer in the Node 22 line. Older Node 22 patch versions are not supported by Prisma 7.

## Quick start

1. Create local configuration:

   ```bash
   cp .env.example .env
   ```

2. Replace all example credentials in `.env`:

   - Keep `POSTGRES_PASSWORD` and the password embedded in `DATABASE_URL` synchronized.
   - Generate independent random values for `JWT_ACCESS_SECRET` and `AUTH_METADATA_SECRET`. For example, run `openssl rand -base64 48` separately for each value.

   Production startup rejects the tracked placeholder values and refuses to reuse JWT signing material as the metadata HMAC key.

3. Build and start the stack. The one-shot migration container applies pending migrations before the API starts:

   ```bash
   docker compose up --build -d
   ```

4. Check the application:

   ```bash
   curl http://localhost:3000/health
   curl http://localhost:3000/health/ready
   ```

5. Explore the API at `http://localhost:3000/docs`.

For host-based development, start only the dependencies and then run NestJS:

```bash
docker compose up -d postgres redis
npm ci
npm run prisma:migrate:deploy
npm run start:dev
```

There is intentionally no public registration endpoint. B2B users will be created through controlled organization onboarding in Phase 3. Tests create isolated fixture accounts directly through the persistence/application boundary.

## Configuration

All runtime configuration is validated during startup. The application fails fast when a required variable is missing or malformed.

| Variable                         | Purpose                                       |
| -------------------------------- | --------------------------------------------- |
| `NODE_ENV`                       | `development`, `test`, or `production`        |
| `PORT`                           | HTTP listen port                              |
| `LOG_LEVEL`                      | Pino log level                                |
| `CORS_ORIGINS`                   | Comma-separated allowed origins               |
| `DATABASE_URL`                   | PostgreSQL connection URL                     |
| `DB_POOL_MAX`                    | Maximum PostgreSQL pool size per API instance |
| `DB_CONNECT_TIMEOUT_MS`          | PostgreSQL connection timeout                 |
| `REDIS_URL`                      | Redis connection URL                          |
| `REDIS_CONNECT_TIMEOUT_MS`       | Redis connection timeout                      |
| `JWT_ACCESS_SECRET`              | HMAC secret for access-token signatures       |
| `JWT_ACCESS_KEY_ID`              | Identifier for the active JWT signing key     |
| `JWT_ACCESS_PREVIOUS_KEYS`       | JSON key ring accepted during JWT rotation    |
| `JWT_ISSUER`                     | Required access-token issuer                  |
| `JWT_AUDIENCE`                   | Required access-token audience                |
| `JWT_ACCESS_TTL_SECONDS`         | Short-lived JWT validity                      |
| `REFRESH_TOKEN_TTL_SECONDS`      | Maximum session and refresh lifetime          |
| `AUTH_METADATA_SECRET`           | HMAC key for IP/rate-limit fingerprints       |
| `AUTH_RATE_LIMIT_MAX`            | Attempts per auth subject/window              |
| `AUTH_RATE_LIMIT_IP_MAX`         | Aggregate attempts per client IP/window       |
| `AUTH_RATE_LIMIT_WINDOW_SECONDS` | Distributed rate-limit window                 |
| `AUTH_PUBLIC_RESPONSE_MIN_MS`    | Enumeration-resistant public response floor   |
| `SWAGGER_ENABLED`                | Enables local OpenAPI UI and JSON             |

Do not commit `.env`; only `.env.example` is tracked.

## Health endpoints

- `GET /health` checks process liveness and never queries external dependencies.
- `GET /health/ready` checks PostgreSQL and Redis concurrently. It returns HTTP 503 with safe dependency status if either is unavailable.

Business APIs use the `/api/v1` prefix. Operational health endpoints remain unversioned.

## Identity API

Public authentication routes:

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/forgot-password`
- `POST /api/v1/auth/reset-password`
- `POST /api/v1/auth/verify-email`
- `POST /api/v1/auth/resend-verification`

Bearer-authenticated routes:

- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/logout-all`
- `POST /api/v1/auth/change-password`
- `GET /api/v1/auth/sessions`
- `DELETE /api/v1/auth/sessions/:sessionId`
- `GET /api/v1/me`

Forgot-password and verification requests deliberately return the same accepted response for known and unknown accounts. Secure token creation and consumption are implemented; email transport will be connected to the asynchronous notification workflow in Phase 8, and tokens are never returned from these request endpoints.

Password change is treated as a security boundary: it revokes every session, refresh token, and outstanding password-reset token. The caller must sign in again with the new password.

## Quality commands

```bash
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run test:auth:e2e
npm run test:e2e
npm run build
npm run format:check
npm run prisma:validate
docker compose --env-file .env.example config --quiet
```

## Architecture

- [Architecture overview](docs/architecture.md)
- [ADR-001: Modular monolith](docs/decisions/ADR-001-modular-monolith.md)
- [ADR-004: Multi-tenant authorization](docs/decisions/ADR-004-multi-tenant-authorization.md)
- [Database and identity ERD](docs/database.md)
- [Security policy and design](SECURITY.md)
- [API examples](docs/api-examples.md)
- [Ten-phase implementation plan](IMPLEMENTATION_PLAN.md)
- [Authoritative build brief](CODEX_B2B_MARKETPLACE_API_BUILD_BRIEF.md)

## Project status

- Phase 1: Foundation — complete
- Phase 2: Identity — complete
- Next phase, pending explicit approval: Organizations

Do not infer future-phase functionality from the planned directory names or documentation.
