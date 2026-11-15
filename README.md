# Cleverest backend

API of the Cleverest consulting platform — NestJS 11 · Prisma 6 · PostgreSQL 16 ·
Clean Architecture / DDD. Rewrite of the legacy Laravel API, following `docs/refonte-backend/`.

- **Run locally**: [Getting started](#getting-started)
- **Test**: [Tests](#tests)
- **Deploy**: [Deploy](#deploy)
- **Configure**: [Environment variables](#environment-variables)
- **Security review**: [`docs/SECURITY-REVIEW.md`](docs/SECURITY-REVIEW.md)
- **API contract**: Swagger UI at `/api/docs` (dev) · `npm run openapi:export` → `openapi.json`

## Business scope

| Context | What it does | Main routes |
|---|---|---|
| `identity-access` | sign-up, login, JWT + rotating refresh tokens, OTP 2FA, users, RBAC + permissions | `/auth`, `/me`, `/users` |
| `quotes` | client requests, consultant team (lead), subquotes, pricing, admin validation, documents | `/quotes`, `/consultant/quotes`, `/admin/quotes` |
| `contracts` | client contract (signed PDF) and consultant engagement contracts | `/contracts`, `/admin/contracts`, `/admin/consultant-contracts`, `/consultant/contracts` |
| `missions` | mission on a signed contract, staffing, acceptance, tasks, progress | `/missions`, `/admin/missions` |
| `deliverables` | consultant uploads, admin release, client validation | `/deliverables`, `/consultant/…`, `/client/…`, `/admin/deliverables` |
| `payments` | client payment proofs, validation, client invoices (PDF, `FAC-YYYY-NNNN`) | `/payments`, `/admin/payments`, `/client/invoices`, `/admin/client-invoices` |
| `consultant-invoices` | consultant invoices capped by the signed engagement, payment | `/consultant/invoices`, `/admin/invoices` |
| `apporteurs` | prospects, transactional conversion into client + signed deal, commissions | `/prospects`, `/admin/prospects`, `/commissions` |
| `reviews` | client rating of a completed mission | `/reviews`, `/admin/reviews` |
| `reporting` | admin dashboard aggregates (`view-statistics`) | `/admin/dashboard/*` |

All routes are under the `/api` prefix.

## Architecture

```
Domain  ←  Application  ←  { Infrastructure, Interface }
```

- **`src/shared/kernel`** — framework-free DDD primitives (`AbstractAggregateRoot`, `DomainException`,
  `Page`, `Clock`, amounts, stored files).
- **`src/shared/application`** — cross-cutting ports (`FileStoragePort`, `NotifierPort`, `PdfGeneratorPort`,
  `AuditLogPort`, `EventBusPort`, `UnitOfWorkPort`), actor resolution, two-phase `PendingWrite`.
- **`src/shared/infrastructure`** — Prisma, storage, notifications (DB + mail), OTP, audit, event bus,
  PDF writer, rate limiting, logger, environment validation.
- **`src/shared/interface/http`** — global guards (throttler → JWT → roles → permissions),
  `AllExceptionsFilter`, `configureApp` (prefix, validation, helmet, CORS, Swagger) used by `main.ts`
  **and** the e2e app.
- **`src/modules/<context>`** — `domain / application / infrastructure / interface` per bounded context.
  The domain imports no NestJS, Prisma or class-validator. Contexts talk through **application facades**
  behind ports declared by the consumer. Ownership and business authorization are enforced
  **in the use case** (guards are a first line only); someone else's resource answers 404.

Errors always have the shape `{ statusCode, error, message, details?, path, timestamp }`, where `error`
is a stable code (`QUOTE_NOT_FOUND`, `MISSION_NOT_COMPLETED`, …).

## Getting started

Prerequisites: Node 20+, npm, Docker.

```bash
cp .env.example .env
docker compose up -d postgres-dev postgres-test   # dev DB on :5442, test DB on :5433
npm install
npm run prisma:generate
npm run prisma:migrate        # applies migrations to the dev DB
npm run db:seed               # roles, permissions, a superadmin (SEED_SUPERADMIN_*)
npm run start:dev             # http://localhost:3000/api · Swagger UI at /api/docs
```

> The dev container is published on **5442** because this workstation already runs a local
> Postgres on 5432. The test DB stays on **5433**.

## Tests

| Command | Scope |
|---|---|
| `npm run test:unit` | domain, use cases, kernel, guards — pure, no I/O |
| `npm run test:cov` | unit + coverage gates (≥ 90 % lines per domain / application folder) |
| `npm run test:integration` | Prisma repositories & adapters against the test DB (`--runInBand`) |
| `npm run test:e2e` | the full HTTP app against the test DB (`--runInBand`), incl. the critical journey and the security checks |
| `npm run lint` / `npm run build` | ESLint / `nest build` |

Integration and e2e need `docker compose up -d postgres-test`; a Jest `globalSetup` applies the
migrations first. Always run them with `--runInBand` (they share one database).

Notable suites: `test/e2e/critical-journey.e2e-spec.ts` (sign-up → quote → contract → mission → tasks →
deliverable → payment → invoice → review), `test/e2e/security.e2e-spec.ts` (every route's access
rules, OpenAPI completeness, headers, rate limiting), `test/integration/convert-prospect.int-spec.ts`
(real transactional rollback).

Definition of done for any change:
`npm run lint && npm run build && npm run test:unit && npm run test:integration && npm run test:e2e`.

## Deploy

The CI (`.github/workflows/ci.yml`) runs lint, build, the three test suites, exports `openapi.json` as a
build artifact, audits production dependencies, then builds the Docker image (pushed to GHCR on `main`).

```bash
docker build -t cleverest-backend .
docker run -d --name cleverest-api -p 3000:3000 \
  -e NODE_ENV=production \
  -e DATABASE_URL='postgresql://…' \
  -e JWT_ACCESS_SECRET="$(openssl rand -base64 48)" \
  -e JWT_REFRESH_SECRET="$(openssl rand -base64 48)" \
  -e CORS_ORIGINS='https://app.example.com' \
  -e TRUST_PROXY=1 \
  -v cleverest-files:/app/storage \
  cleverest-backend
```

- On start, the entrypoint runs **`prisma migrate deploy`** (committed migrations only, never a reset),
  then the API. Set `SKIP_MIGRATIONS=true` if migrations run as a separate release step.
- **Health check**: `GET /api/health` → `200 {status:"ok",db:"up"}`, or `503` when the database does not
  answer. The image declares it as its Docker `HEALTHCHECK`.
- The container runs as the non-root `node` user; uploaded files live in the `/app/storage` volume —
  **back it up** together with the database.
- First superadmin: run the seed once against the production database with strong
  `SEED_SUPERADMIN_EMAIL` / `SEED_SUPERADMIN_PASSWORD`, then change the password.

**Not production-ready yet** (see the security review): real e-mail delivery (`MAIL_DRIVER=smtp`) and
S3 storage are not implemented; production boot refuses those drivers.

## Environment variables

Validated at boot by zod (`src/shared/infrastructure/config/env.schema.ts`); an invalid value aborts startup.

| Variable | Default | Notes |
|---|---|---|
| `NODE_ENV` | `development` | `production` enables the strict checks below and hides Swagger |
| `PORT` / `API_PREFIX` | `3000` / `api` | |
| `DATABASE_URL` | — | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | — | production: 32+ random chars, different from each other |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL` | `900s` / `30d` | |
| `OTP_TTL_SECONDS` / `OTP_MAX_ATTEMPTS` / `OTP_RESEND_COOLDOWN_SECONDS` | `300` / `5` / `60` | 2FA |
| `CORS_ORIGINS` | empty (no CORS) | comma-separated front-end origins |
| `TRUST_PROXY` | `0` | number of proxies in front (client IP for rate limiting) |
| `SWAGGER_ENABLED` | on, off in production | force with `true` / `false` |
| `RATE_LIMIT_PER_MINUTE` | `300` | per IP, every route |
| `AUTH_RATE_LIMIT_PER_MINUTE` | `10` | per IP and endpoint: login, OTP, refresh, register |
| `STORAGE_DRIVER` / `STORAGE_LOCAL_ROOT` | `local` / `./storage` | `s3` not implemented yet |
| `MAIL_DRIVER` / `MAIL_FROM` | `log` | `smtp` not implemented yet; `log` only logs subject and recipient |
| `SEED_SUPERADMIN_EMAIL` / `SEED_SUPERADMIN_PASSWORD` | dev values | used by `npm run db:seed` only |

## Auth model

- Short-lived **JWT access token** + opaque **refresh token**, rotated on every use and stored hashed.
- Optional **OTP 2FA** (`PATCH /api/me/2fa`): login answers `202 { otpRequired, challengeId }`, then
  `POST /api/auth/otp/verify`.
- **Roles** `client`, `consultant`, `apporteur`, `admin`, `superadmin` and **permissions**; `superadmin`
  holds every permission, `admin` only those granted — so `admin ≠ superadmin`.
- Passwords hashed with **argon2id**; legacy bcrypt hashes are verified and re-hashed on next login.
