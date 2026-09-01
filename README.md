# Cleverest backend

NestJS · Clean Architecture · DDD. Rewrite of the legacy Laravel API
(`old-back/`), following `docs/refonte-backend/`.

## Layers & dependency rule

```
Domain  ←  Application  ←  { Infrastructure, Interface }
```

- **`src/shared/kernel`** — framework-free DDD primitives (`Result`, `DomainException`,
  `AbstractEntity/AggregateRoot/ValueObject`, `Uuid`, `Page`, `Clock`).
- **`src/shared/application/ports`** — cross-cutting ports (`FileStoragePort`, `NotifierPort`,
  `OtpSenderPort`, `PdfGeneratorPort`, `AuditLogPort`, `EventBusPort`, `UnitOfWorkPort`).
- **`src/shared/infrastructure`** — Prisma, storage (local/S3), notifier (db + mail),
  OTP sender, audit log, in-memory event bus, pino logger, zod env validation.
- **`src/shared/interface/http`** — `JwtAuthGuard` (global, `@Public()` to opt out),
  `RolesGuard` (`@Roles`), `PermissionsGuard` (`@RequirePermissions`), `AllExceptionsFilter`
  (`DomainException` → `{ statusCode, error, message, details?, path, timestamp }`).
- **`src/modules/<context>`** — one folder per bounded context, each with
  `domain / application / infrastructure / interface`. The domain never imports
  NestJS, Prisma or class-validator. Use cases receive ports by constructor; ownership
  and business authorization are enforced **inside the use case**.

Implemented so far (LOT 1): `identity-access` (+ a `reporting` RBAC placeholder).

## Prerequisites

- Node 20+ and npm
- Docker (for the Postgres containers)

## Getting started

```bash
cp .env.example .env
docker compose up -d postgres-dev postgres-test   # dev on :5442, test on :5433
npm install
npm run prisma:generate
npm run prisma:migrate        # applies migrations to the dev DB
npm run db:seed               # roles, permissions, a demo superadmin
npm run start:dev             # http://localhost:3000/api  ·  docs at /api/docs
```

> The plan calls for the dev DB on `5432`; this workstation already runs a local
> `postgresql@14` there, so `docker-compose.yml` publishes the dev container on
> **`5442`**. The dedicated **test** DB stays on **`5433`** as specified.

## Configuration

`@nestjs/config` validates the environment at boot (zod, `src/shared/infrastructure/config/env.schema.ts`);
a missing/invalid variable aborts startup. Keys: `DATABASE_URL`, `JWT_ACCESS_SECRET`,
`JWT_ACCESS_TTL`, `JWT_REFRESH_SECRET`, `JWT_REFRESH_TTL`, `OTP_TTL_SECONDS`,
`OTP_MAX_ATTEMPTS`, `OTP_RESEND_COOLDOWN_SECONDS`, `STORAGE_DRIVER`, `MAIL_DRIVER`, …

## Tests

| Command | Scope |
|---|---|
| `npm run test:unit` | domain + application + kernel + guards/filter (pure, no I/O) |
| `npm run test:integration` | Prisma repositories & adapters against the `:5433` test DB (`--runInBand`) |
| `npm run test:e2e` | full HTTP app against the test DB (`--runInBand`) |
| `npm run test:cov` | unit coverage (domain + use cases ≥ 90% lines) |
| `npm run lint` / `npm run build` | ESLint (flat config) / `nest build` |

Integration & e2e require `docker compose up -d postgres-test`; a Jest `globalSetup`
runs `prisma migrate deploy` against it before the suite.

## Auth model

- **JWT access token** (short-lived) + **opaque refresh token** (rotated on every use,
  sha-256 hashed at rest). `POST /api/auth/refresh` revokes the presented token and
  issues a new pair.
- **OTP / 2FA** opt-in per user (`PATCH /api/me/2fa`). When enabled, `POST /api/auth/login`
  returns `202 { otpRequired, challengeId }`; `POST /api/auth/otp/verify` completes it.
- **RBAC + granular permissions**: `superadmin` is seeded with every permission, `admin`
  with none — so `admin ≠ superadmin` (e.g. `GET /api/admin/dashboard/summary` requires
  `view-statistics`).
- Passwords: **argon2id**; legacy **bcrypt** hashes are verified transparently and
  re-hashed to argon2 on the next successful login.
