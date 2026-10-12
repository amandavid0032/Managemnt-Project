# EduHub

Education discovery platform and institution management SaaS.

Students and parents search and compare institutions globally; institutions
manage their own operations on the same platform. Built as a **modular
monolith** — deliberately not microservices.

> **Status: Phase 1 (foundation).** Institution discovery, authentication and
> the multi-tenant membership model are implemented and tested. Everything in
> the Roadmap below is not built yet.
>
> The original Express + MongoDB backend has been removed now that the
> frontend runs entirely on `api/`. It remains in git history at commit
> `dbb1f18` if it is ever needed.

---

## Architecture

```
Managemnt-Project/
├── api/                    NestJS + TypeScript + PostgreSQL  ← the service
│   ├── src/
│   │   ├── main.ts               bootstrap, helmet, CORS, graceful shutdown
│   │   ├── app.module.ts         global guards, interceptors, filters
│   │   ├── config/               environment schema (validated at boot)
│   │   ├── common/               guards · filters · interceptors · decorators
│   │   ├── database/             PrismaService lifecycle
│   │   ├── auth/                 register · login · refresh · logout
│   │   ├── institutions/         discovery + CRUD
│   │   ├── memberships/          tenant-scoped membership management
│   │   └── health/               liveness + database readiness
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── migrations/           versioned, reviewable SQL
│   │   └── seed.ts               deterministic demo data
│   └── test/                     e2e suites, incl. tenant isolation
│
├── frontend/               React 19 + CRA + Tailwind
│   └── src/
│       ├── api/                  axiosClient → institutionsApi
│       ├── hooks/                useInstitutions (paginated)
│       └── components/           institutions · common · layout
│
├── docs/                   audit, architecture and phase reports
├── docker-compose.yml      postgres + api
└── .github/workflows/ci.yml
```

### Stack

| Layer | Technology | Why |
|---|---|---|
| API | NestJS 11, TypeScript strict | Module boundaries that survive growth |
| Database | PostgreSQL 16 | The domain is relational; tenant isolation and FTS come free |
| ORM | Prisma 6 | Reviewable SQL migrations, exact generated types |
| Auth | JWT access + persisted refresh tokens | Stateless JWT alone cannot implement logout |
| Hashing | Argon2id (`@node-rs/argon2`) | Memory-hard; prebuilt binaries avoid node-gyp |
| Validation | class-validator + `forbidNonWhitelisted` | Unknown fields are rejected, not ignored |
| Logging | Pino (`nestjs-pino`) | Structured JSON with per-request ids |
| Frontend | React 19, CRA, Tailwind | Preserved from the existing app |

### Deliberately NOT used

Redis · BullMQ · Kafka · OpenSearch · Kubernetes · Terraform · microservices ·
S3 · PostGIS. None solves a problem this phase has. The architecture keeps each
addable later without a rewrite.

---

## Documentation

All project reports live in [`docs/`](docs/):

| Document | What it covers |
|---|---|
| [`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md) | **Start here** — what is done, what is verified, what is next |
| [`docs/EDUHUB_AUDIT.md`](docs/EDUHUB_AUDIT.md) | Audit of the original codebase — inventory and security findings |
| [`docs/EDUHUB_ARCHITECTURE.md`](docs/EDUHUB_ARCHITECTURE.md) | Architecture decisions, database design and migration plan |
| [`docs/PHASE1_REVIEW.md`](docs/PHASE1_REVIEW.md) | What Phase 1 built, what was verified, and known issues |

---

## Prerequisites

- **Node.js 22+**
- **PostgreSQL 16** — `brew install postgresql@16 && brew services start postgresql@16`
- Docker (optional; only for the containerised workflow)

---

## Local setup

```bash
# 1. Databases
createdb eduhub_dev
createdb eduhub_test
createdb eduhub_shadow          # Prisma WIPES this one — keep it throwaway

# 2. API
cd api
cp .env.example .env            # then fill in the values below
npm install
npx prisma generate
npx prisma migrate deploy
npm run db:seed
npm run start:dev               # http://localhost:4000

# 3. Frontend (separate terminal)
cd frontend
cp .env.example .env.local
npm install
npm start                       # http://localhost:3000
```

Generate secrets with `openssl rand -hex 32`. Never commit a `.env`.

---

## Environment variables

### `api/.env`

| Variable | Required | Default | Notes |
|---|---|---|---|
| `NODE_ENV` | no | `development` | `development` \| `test` \| `production` |
| `PORT` | no | `4000` | |
| `API_PREFIX` | no | `api` | Routes become `/api/v1/...` |
| `DATABASE_URL` | **yes** | — | PostgreSQL connection string |
| `SHADOW_DATABASE_URL` | **yes (dev)** | — | ⚠️ **Prisma drops and recreates this database.** Never point it at dev, test or production data |
| `JWT_ACCESS_SECRET` | **yes** | — | ≥32 chars; boot fails otherwise |
| `JWT_ACCESS_TTL` | no | `15m` | Access token lifetime |
| `REFRESH_TOKEN_TTL_DAYS` | no | `30` | Refresh token lifetime |
| `CORS_ORIGINS` | no | `http://localhost:3000` | Comma-separated |
| `THROTTLE_ENABLED` | no | `true` | Cannot be `false` in production — the schema rejects it |
| `THROTTLE_TTL_SECONDS` | no | `60` | |
| `THROTTLE_LIMIT` | no | `120` | Global default; auth routes are stricter |
| `LOG_LEVEL` | no | `info` | |

### `frontend/.env.local`

| Variable | Default | Notes |
|---|---|---|
| `REACT_APP_API_URL` | `http://localhost:4000/api/v1` | **Everything here ships to the browser — never put a secret in it** |

---

## Commands

### API (`cd api`)

| Command | Does |
|---|---|
| `npm run start:dev` | Watch mode |
| `npm run start:prod` | Run the compiled build |
| `npm run build` | Compile to `dist/` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` / `lint:fix` | ESLint |
| `npm test` | Unit tests |
| `npm run test:e2e` | E2E suite, including tenant isolation |
| `npm run prisma:migrate` | Create + apply a migration (dev) |
| `npm run prisma:deploy` | Apply committed migrations (CI/prod) |
| `npm run prisma:status` | Show migration state |
| `npm run prisma:studio` | Browse the database |
| `npm run db:seed` | Load demo data (refuses to run in production) |

### Frontend (`cd frontend`)

`npm start` · `npm run build` · `npm test`

### Docker

```bash
cp .env.example .env            # set POSTGRES_PASSWORD and JWT_ACCESS_SECRET
docker compose up --build       # api on :4000, postgres on :5432
docker compose down             # add -v to also drop the data volume
```

The API container waits for Postgres to report healthy, then runs
`prisma migrate deploy` before starting.

---

## Database

Phase 1 is six tables. Later modules hang off this foundation rather than
replacing it.

```
users ──────────────┬─< refresh_tokens
                    └─< institution_memberships >── institutions ──┬─< institution_external_ids
                                                                   └─< institution_media
```

| Table | Purpose |
|---|---|
| `users` | One EduHub account per person, independent of any institution |
| `refresh_tokens` | Hashed refresh tokens with rotation families — makes logout real |
| `institutions` | The core discovery entity |
| `institution_external_ids` | Provenance + `UNIQUE (source, external_id)` ingestion idempotency key |
| `institution_media` | Ordered images with alt text and per-image attribution |
| `institution_memberships` | **The tenancy core** — a user's time-bounded relationship with an institution |

### Design decisions worth knowing

- **`institutions.email` is optional and NOT unique.** Treating email as an
  institution's identity blocks bulk import: real datasets often have no email,
  or share one across campuses.
- **There is no `rating` column.** Ratings must be derived from real reviews.
  The previous model generated a random 3.0–5.0 score and rendered it as stars.
- **IDs are UUIDv7** — time-ordered, so B-tree indexes do not fragment the way
  UUIDv4 does, and row counts are not leaked the way `serial` does.
- **Soft deletes use partial unique indexes** (`WHERE deleted_at IS NULL`), so a
  deleted slug or email can be reused.
- **A user may hold several roles at one institution** (teacher *and* student),
  but not the same role twice concurrently.

### Migrations

```bash
npm run prisma:migrate -- --name describe_the_change   # create + apply
npm run prisma:status                                  # what is applied
```

Migrations are versioned SQL committed to git. Some constraints — partial
unique indexes and CHECK constraints — cannot be expressed in `schema.prisma`
and are hand-written inside the migration SQL. **They are load-bearing.** Keep
them in sync when the schema changes; CI fails the build on drift.

> ⚠️ `prisma migrate reset` **destroys all data**. Never run it against
> anything but a local development database.

---

## API

Base URL: `/api/v1`

### Response envelope

Success — the shape the existing frontend already consumed, extended with
pagination:

```json
{
  "success": true,
  "count": 20,
  "data": [ ... ],
  "meta": {
    "pagination": {
      "page": 1, "limit": 20, "total": 137,
      "totalPages": 7, "hasNext": true, "hasPrevious": false
    }
  }
}
```

Error — internal detail is logged, never returned:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": ["property role should not exist"]
  },
  "meta": { "requestId": "…", "timestamp": "…", "path": "/api/v1/…" }
}
```

### Endpoints

| Method | Path | Auth | Notes |
|---|---|---|---|
| `GET` | `/health` | public | Liveness + database readiness |
| `POST` | `/auth/register` | public | 5/min. Role is **always** `USER` |
| `POST` | `/auth/login` | public | 10/min. Sets httpOnly refresh cookie |
| `POST` | `/auth/refresh` | cookie | Rotates; replay revokes the whole family |
| `POST` | `/auth/logout` | cookie | Revokes the token server-side |
| `GET` | `/auth/me` | bearer | Current user |
| `GET` | `/institutions` | public* | Paginated, filtered, searchable |
| `GET` | `/institutions/:idOrSlug` | public* | Accepts a UUID or a slug |
| `POST` | `/institutions` | platform admin | Created as `DRAFT` |
| `PATCH` | `/institutions/:id` | platform admin | |
| `DELETE` | `/institutions/:id` | platform admin | Soft delete |
| `GET` | `/institutions/:institutionId/memberships` | tenant admin/staff | |
| `GET` | `/institutions/:institutionId/memberships/:id` | tenant admin/staff | |
| `POST` | `/institutions/:institutionId/memberships` | tenant admin | |

\* Public, but authenticated platform staff additionally see unpublished records.

### Query parameters — `GET /institutions`

`page` · `limit` (max 100) · `search` · `category` · `countryCode` · `state` ·
`city` · `sortBy` (`name`\|`createdAt`\|`updatedAt`) · `sortOrder` (`asc`\|`desc`)

`category` is capitalisation-independent: `school`, `School`, `SCHOOL` and
`training center` all resolve to the canonical enum. Unknown parameters are
**rejected with 400**, not ignored.

---

## Security model

| Control | Implementation |
|---|---|
| Auth default | `JwtAuthGuard` is global; routes opt **out** with `@Public()`, so a new endpoint is protected by default |
| Privilege escalation | `RegisterDto` has no role field; `forbidNonWhitelisted` turns `{"role":"super_admin"}` into a 400 |
| Role source | Read from the database on every request, never from the token body |
| Immediate revocation | `tokenVersion` and account status are re-checked per request |
| Refresh tokens | Opaque, SHA-256 hashed at rest, httpOnly cookie, rotation with reuse detection |
| Passwords | Argon2id (m=19456, t=2, p=1) |
| Tenant isolation | `TenantGuard` — institution id from the **route**, verified against an ACTIVE membership |
| Existence disclosure | Cross-tenant access returns **404, not 403** |
| Rate limiting | Global + stricter per-auth-route budgets |
| Headers | `helmet` |
| Error leakage | One exception filter; stack traces and driver errors never reach the client |

### Two separate role axes

- **Platform** — `USER` · `PLATFORM_ADMIN` · `SUPER_ADMIN` (on `users`)
- **Institution** — `STUDENT` · `TEACHER` · `STAFF` · `INSTITUTION_ADMIN`
  (on `institution_memberships`)

A person is `USER` platform-wide and may be `INSTITUTION_ADMIN` at one
institution and `STUDENT` at another. **An institution-issued member ID is an
identifier, never a credential.**

---

## Testing

```bash
cd api
npm run test:e2e
```

85 e2e tests across four suites. The tenant isolation suite is the important
one — each test in it is a data breach if it fails:

- A member of Institution A cannot read Institution B's data
- Denial is 404, so tenant existence is not disclosed
- `institutionId` injected into a request body is rejected
- A tenant admin cannot escalate to platform-wide operations
- A replayed refresh token revokes its entire rotation family

Tests run against `eduhub_test` and truncate between suites. Rate limiting is
switched off for business-logic suites and covered by its own suite.

---

## CI

`.github/workflows/ci.yml` — install → generate → migrate → **drift check** →
typecheck → lint → unit → e2e → build, plus a Docker image build and the
frontend build. The drift check fails if `schema.prisma` and the committed
migrations disagree.

---

## Roadmap

| Phase | Scope |
|---|---|
| ✅ 1 | Foundation · identity · institutions · memberships · discovery |
| 2 | Email verification · password reset · institution media uploads · profiles |
| 3 | Full-text + geo search · comparison · favourites · Next.js for SEO |
| 4 | External data ingestion (Google Places, open datasets) · BullMQ + Redis |
| 5 | Reviews and ratings — *the first real `rating` data* |
| 6 | Institution management: programmes · courses · enrolment · attendance · fees |
| 7 | Hostel management |

---

## Contributing

1. Never commit `.env`. `.env.example` documents every variable.
2. Never trust a client-supplied role, tenant id, or status.
3. Every tenant-scoped query must filter by the id from `TenantContext`.
4. Add a tenant-isolation test with every new tenant-scoped endpoint.
5. Schema changes ship as migrations — never edit an applied migration.
6. Do not add fake data or UI that only pretends to work.
