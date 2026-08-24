# Wellora Marketplace API

Wellora Marketplace is a production-style B2B employee-benefits marketplace API built as a modular monolith. The repository is being delivered phase by phase; Phase 1 provides the operational foundation only. Authentication and marketplace business domains are intentionally not implemented yet.

## Current capabilities

- NestJS 11 application with strict TypeScript
- Startup environment validation
- PostgreSQL access through Prisma 7 and the `pg` driver adapter
- Redis connectivity
- Structured Pino request logging with correlation IDs and sensitive-field redaction
- Separate liveness and dependency-readiness endpoints
- Reproducible Docker Compose development environment
- Jest unit/e2e test foundations and GitHub Actions CI

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

2. Replace the example PostgreSQL password in `.env`. Keep `POSTGRES_PASSWORD` and the password embedded in `DATABASE_URL` synchronized.

3. Start the full stack:

   ```bash
   docker compose up --build -d
   ```

4. Check the application:

   ```bash
   curl http://localhost:3000/health
   curl http://localhost:3000/health/ready
   ```

For host-based development, start only the dependencies and then run NestJS:

```bash
docker compose up -d postgres redis
npm ci
npm run prisma:generate
npm run start:dev
```

No database migration exists yet because Phase 1 intentionally has no business tables.

## Configuration

All runtime configuration is validated during startup. The application fails fast when a required variable is missing or malformed.

| Variable                   | Purpose                                       |
| -------------------------- | --------------------------------------------- |
| `NODE_ENV`                 | `development`, `test`, or `production`        |
| `PORT`                     | HTTP listen port                              |
| `LOG_LEVEL`                | Pino log level                                |
| `CORS_ORIGINS`             | Comma-separated allowed origins               |
| `DATABASE_URL`             | PostgreSQL connection URL                     |
| `DB_POOL_MAX`              | Maximum PostgreSQL pool size per API instance |
| `DB_CONNECT_TIMEOUT_MS`    | PostgreSQL connection timeout                 |
| `REDIS_URL`                | Redis connection URL                          |
| `REDIS_CONNECT_TIMEOUT_MS` | Redis connection timeout                      |

Do not commit `.env`; only `.env.example` is tracked.

## Health endpoints

- `GET /health` checks process liveness and never queries external dependencies.
- `GET /health/ready` checks PostgreSQL and Redis concurrently. It returns HTTP 503 with safe dependency status if either is unavailable.

Business APIs use the `/api/v1` prefix. Operational health endpoints remain unversioned.

## Quality commands

```bash
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
npm run format:check
npm run prisma:validate
docker compose --env-file .env.example config --quiet
```

## Architecture

- [Architecture overview](docs/architecture.md)
- [ADR-001: Modular monolith](docs/decisions/ADR-001-modular-monolith.md)
- [Ten-phase implementation plan](IMPLEMENTATION_PLAN.md)
- [Authoritative build brief](CODEX_B2B_MARKETPLACE_API_BUILD_BRIEF.md)

## Project status

- Phase 1: Foundation
- Next phase, pending explicit approval: Identity

Do not infer future-phase functionality from the planned directory names or documentation.
