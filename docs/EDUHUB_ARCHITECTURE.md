# EduHub — Architecture & Migration Plan (STEP 2)

**Status:** Proposal. No production code has been modified.
**Prerequisite doc:** `EDUHUB_AUDIT.md` (inventory + security findings)
**Date:** 2026-09-08

---

## 0. Execution blockers found during inspection

These change what Phase 1 can actually deliver and must be resolved before STEP 4.

| Blocker | Detail | Impact |
|---|---|---|
| **Docker daemon not running** | `docker`/`docker-compose` CLI exist at `/usr/local/bin`, daemon unreachable | Can author `docker-compose.yml` + Dockerfiles, **cannot run or verify them** (violates Rule 12) |
| **PostgreSQL not installed** | no `psql`, `postgres`, `pg_ctl`, `initdb`; not in Homebrew | **Cannot run migrations, seed, or integration tests** without installing it |

✅ npm registry reachable · ✅ Node v22.18.0 (NestJS 11 compatible) · ✅ 32 GB free disk

**Resolution required:** either start Docker Desktop, or install PostgreSQL 16 via Homebrew. Without one of these, Phase 1 stops at "code written but unverified" — which the brief explicitly forbids.

---

## A. What currently exists

Full detail in `EDUHUB_AUDIT.md`. Condensed inventory:

| Area | Reality |
|---|---|
| Backend | Express 5, plain JS, ESM. **609 LOC total.** 1 model, 6 handlers, 34-line `server.js` |
| Database | MongoDB, **one collection** (`institutions`), 1 index (unique email), no relations |
| Auth | `authController.js` + `authRoutes.js` + `User.js` written, **never mounted**, `JWT_SECRET` undefined → throws |
| Frontend | CRA + React 19 + Tailwind, **1,404 LOC**, one page, no routing |
| Live API | 7 endpoints, **all unauthenticated**, no pagination, 50-record cap |
| Tests | 0 |
| CI/CD | 0 |
| Docker | 2 files, both non-functional |
| Integrations | 0 |
| Git | `.env` + `node_modules` committed; no `.gitignore` |

**Verified dead code** (grep-confirmed zero importers):
- `frontend/src/components/HomePage.jsx` — 240-line orphan admin mockup
- `frontend/src/routes/AppRoutes.jsx` — imports 5 files that do not exist
- `react-router-dom` — used only by the dead `AppRoutes.jsx`
- `bootstrap` — **zero references anywhere in `src/`**

---

## B. What should be PRESERVED

| Asset | Why | Action |
|---|---|---|
| `SchoolCard` / `CollegeCard` visual design | Clean, responsive, working carousel + star rendering | Merge into one `InstitutionCard`, **markup and Tailwind classes kept verbatim** |
| `axiosClient → institutionsApi → useFetchInstitutions → sections` | Correct separation of concerns | **Keep the architecture.** Fix internals only |
| `{ success, count, data }` envelope | Working frontend contract | **Extend** with `meta.pagination`, never break |
| `User.js` bcrypt logic | `pre('save')` + `isModified` guard + `matchPassword` — textbook correct | Port the *logic*, upgrade the algorithm |
| Deterministic seed concept | `fx.seed(2025 + idx)` — genuinely thoughtful | Reimplement for Postgres |
| Tailwind config + `.scrollbar-hide` | Works | Untouched |
| Layout/section composition | Sound discovery UX pattern | Untouched |

---

## C. What should be DELETED

| Target | Reason |
|---|---|
| `frontend/src/components/HomePage.jsx` | Orphan, 0 importers, hardcoded fake stats |
| `frontend/src/routes/AppRoutes.jsx` | Imports 5 nonexistent files |
| `backend/src/migrations/institution.migration.js` | **Drops the collection on import.** Actively dangerous |
| `backend/src/scripts/migrate.js` | Executes the above |
| `backend/src/models/data/institutions.json` | Stale 200-record duplicate, older shape |
| `bootstrap` dependency | Zero usage, conflicts conceptually with Tailwind |
| `react-router-dom` (for now) | Only consumer is deleted dead code. Re-add in Phase 3 with real pages |
| Committed `node_modules` (2,153 files) | Untrack — never delete from disk |
| `backend/` (Express) | **Only after** frontend cutover is verified green |

---

## D. What should be MIGRATED

**Code migrated:** auth *logic* (not files), seed *concept* (not the script), response envelope *shape*, frontend components (dedup only).

**Data migrated: NOTHING.**

This is deliberate and is the single biggest risk reduction available. The 3,000 Mongo records are faker output with incoherent values (`{name: "Sesto Tarso sardo College", type: "School", country: "Swaziland", state: "Verona"}`) and randomly generated ratings. Migrating them would import garbage into a schema designed for real data, and would carry the fake-rating problem across.

Instead: **generate fresh deterministic demo seed data directly in Postgres**, tagged `source = SEED`, with the seed command refusing to run when `NODE_ENV=production`.

---

## E. What should be REDESIGNED

1. **Institution schema** — email-as-identity removed, external IDs + provenance added, geo added, fabricated rating deleted.
2. **Institution type** — free text → controlled enum + optional local label.
3. **Auth** — roles moved server-side; refresh tokens persisted so logout actually works.
4. **Tenancy** — `user.institutionId` (one-to-one) → `institution_memberships` (many-to-many, time-bounded).
5. **Migrations** — destructive import-time script → versioned, reviewable SQL.
6. **Error handling** — 6 copy-pasted try/catch blocks → one exception filter.
7. **Pagination** — hardcoded `limit=50` → real cursor/offset contract.

---

## F. Proposed final architecture

**Modular monolith. NestJS + TypeScript (strict) + PostgreSQL 16 + Prisma. REST. No Redis, no queues, no PostGIS, no search engine in Phase 1.**

### ORM decision: **Prisma** (chosen over TypeORM)

| Reason | Detail |
|---|---|
| **Migrations match the brief exactly** | `prisma migrate dev` emits reviewable `.sql` files committed to git; `migrate deploy` applies them in CI/prod; drift detection catches manual edits. TypeORM's `synchronize` is a production foot-gun and its migration generation is less reliable. |
| **End-to-end type safety** | Generated client types are exact. TypeORM relies on decorators + reflection, leaving gaps `tsc` cannot catch. |
| **Smaller leap from Mongoose** | Data-mapper style with explicit queries. TypeORM's Active Record + decorator entities is a bigger conceptual jump. |
| **N+1 is explicit** | `select`/`include` are opt-in. TypeORM's lazy relations hide N+1 until production. |

**Trade-offs accepted, with mitigations:**

| Trade-off | Mitigation |
|---|---|
| Weaker dynamic query building | `$queryRaw` (typed, parameterized) for the few complex search/geo queries |
| `schema.prisma` cannot express partial unique indexes or CHECK constraints | Hand-write that SQL **inside** the generated migration file — normal practice, and exactly why migrations get reviewed |
| Friction with Postgres RLS (single pooled DB user) | RLS deferred to Phase 3; app-layer choke point designed so RLS layers on without rewrite |
| No true nested transactions | Explicit `$transaction` boundaries at the service layer |

> If the requirement were heavy runtime-dynamic query building **or** RLS from day one, TypeORM would win. Neither applies at this phase.

### Auth decision — improving on the brief

The brief offered "JWT access+refresh **OR** secure sessions." **Pure stateless JWT cannot implement logout**, which is a hard requirement. Recommendation takes the best of both:

| Component | Choice | Rationale |
|---|---|---|
| Password hash | **Argon2id** via `@node-rs/argon2` | OWASP-preferred. The Rust binding ships prebuilt binaries — avoids `node-gyp` toolchain failures that plague the `argon2` npm package. Params m=19456, t=2, p=1. Fallback to `bcrypt` cost 12 if a prebuilt is unavailable |
| Access token | JWT, **15 min**, carries `sub` + `platformRole` + `tokenVersion` only | Short-lived. **Deliberately carries no memberships** — membership changes must take effect immediately, not after token expiry |
| Refresh token | **Opaque 32-byte random, stored hashed (SHA-256) in `refresh_tokens`**, 30 days | A DB row means revocation is real. Never store the raw token |
| Transport | httpOnly + Secure + SameSite=Lax cookie | Not reachable from JS → XSS cannot exfiltrate it |
| Rotation | **Rotation with reuse detection** — replaying a consumed token revokes the entire token family | Detects stolen-token replay |

### Tenant isolation strategy (the most important decision here)

**Phase 1: application-layer enforcement through a single choke point.**

```
JwtAuthGuard      → resolves AuthUser { id, platformRole } from the access token
       ↓
TenantGuard       → reads :institutionId from the ROUTE (never the body)
                  → looks up an ACTIVE institution_membership for (userId, institutionId)
                  → denies with 404 (not 403) if absent  ← no existence leakage
                  → attaches TenantContext { institutionId, membershipRole }
       ↓
Service layer     → accepts TenantContext; every tenant-scoped query includes
                    `where: { institutionId: ctx.institutionId }`
```

**Hard rules enforced by DTO design:** tenant-scoped DTOs contain **no** `institutionId` field, and global validation runs `whitelist: true, forbidNonWhitelisted: true` — so a client that sends `institutionId` or `role` receives `400`, it is not silently ignored.

**Why not Postgres RLS in Phase 1:** RLS needs `SET LOCAL app.current_tenant` inside every transaction, which forces all queries through interactive transactions and complicates connection pooling. With 5 tables, that is over-engineering (Rule 5). Because isolation already runs through **one** choke point, RLS can be added in Phase 3 as defense-in-depth **without touching service code**.

---

## G. Proposed database schema (Phase 1 — 5 tables only)

IDs are **UUIDv7** (application-generated): time-ordered so B-tree indexes do not fragment like UUIDv4, and unlike `serial` they do not leak row counts.

### Enums

```
InstitutionCategory  SCHOOL | COLLEGE | UNIVERSITY | POLYTECHNIC | INSTITUTE
                     | TRAINING_CENTER | COACHING_CENTER | OTHER
InstitutionStatus    DRAFT | PENDING_REVIEW | PUBLISHED | SUSPENDED | ARCHIVED
DataSource           MANUAL | SEED | INSTITUTION_SUBMITTED | GOOGLE_PLACES | GOV_DATASET
UserStatus           PENDING_VERIFICATION | ACTIVE | SUSPENDED | DEACTIVATED
PlatformRole         USER | PLATFORM_ADMIN | SUPER_ADMIN
MembershipRole       STUDENT | TEACHER | STAFF | INSTITUTION_ADMIN
MembershipStatus     PENDING | ACTIVE | SUSPENDED | LEFT | REJECTED
```

> **Capitalization is solved at the boundary**, not in the database: a DTO transformer uppercases and normalizes incoming values, so `school`, `School`, and `SCHOOL` all resolve to `SCHOOL`. The DB only ever stores the canonical form.

### `users`

```
id                 uuid        PK
email              text        NOT NULL   -- stored lowercase, CHECK (email = lower(email))
password_hash      text        NULL       -- nullable for future OAuth-only accounts
full_name          text        NOT NULL
status             UserStatus  NOT NULL DEFAULT 'PENDING_VERIFICATION'
platform_role      PlatformRole NOT NULL DEFAULT 'USER'   -- ⚠ NEVER settable from a request DTO
email_verified_at  timestamptz NULL
last_login_at      timestamptz NULL
token_version      int         NOT NULL DEFAULT 0   -- bump to invalidate all access tokens
created_at / updated_at / deleted_at
```
Indexes: `UNIQUE (email) WHERE deleted_at IS NULL` · `(status)`

### `refresh_tokens`

```
id             uuid PK
user_id        uuid NOT NULL FK → users ON DELETE CASCADE
token_hash     text NOT NULL           -- SHA-256; raw token never persisted
family_id      uuid NOT NULL           -- rotation family, for reuse detection
expires_at     timestamptz NOT NULL
revoked_at     timestamptz NULL
replaced_by_id uuid NULL FK → refresh_tokens
user_agent     text NULL
ip_address     inet NULL
created_at     timestamptz
```
Indexes: `UNIQUE (token_hash)` · `(user_id)` · `(family_id)` · `(expires_at)`

### `institutions`

```
id                uuid PK
slug              text NOT NULL              -- URL identity, generated from name
name              text NOT NULL
legal_name        text NULL
category          InstitutionCategory NOT NULL
type_label        text NULL                  -- local term: "Gymnasium", "TAFE", "Lycée"
description       text NULL
email             text NULL                  -- ⚠ OPTIONAL and NOT UNIQUE (was the fatal flaw)
phone             text NULL
website           text NULL
address_line1     text NULL
address_line2     text NULL
city              text NULL
state             text NULL
postal_code       text NULL
country_code      char(2) NOT NULL           -- ISO-3166-1 alpha-2, CHECK ~ '^[A-Z]{2}$'
latitude          decimal(9,6) NULL          -- CHECK BETWEEN -90 AND 90
longitude         decimal(9,6) NULL          -- CHECK BETWEEN -180 AND 180
status            InstitutionStatus NOT NULL DEFAULT 'DRAFT'
source            DataSource NOT NULL DEFAULT 'MANUAL'
source_updated_at timestamptz NULL
verified_at       timestamptz NULL
created_by_user_id uuid NULL FK → users ON DELETE SET NULL
created_at / updated_at / deleted_at
```

**Deliberately absent: `rating`.** No column, no default, no random values. `rating_avg` + `rating_count` arrive in the Reviews phase as values *derived from real reviews*.

Indexes:
- `UNIQUE (slug) WHERE deleted_at IS NULL` ← partial: lets a soft-deleted slug be reused
- `(category, country_code)` — the homepage query
- `(country_code, state, city)` — location filtering
- `(status) WHERE deleted_at IS NULL`
- **GIN trigram on `name`** (`pg_trgm`) — fuzzy search without a search engine
- `(latitude, longitude)` — bounding-box filter; PostGIS only when radius search is genuinely needed

### `institution_external_ids` — the ingestion idempotency key

```
id              uuid PK
institution_id  uuid NOT NULL FK → institutions ON DELETE CASCADE
source          DataSource NOT NULL
external_id     text NOT NULL
metadata        jsonb NOT NULL DEFAULT '{}'
fetched_at      timestamptz NULL
created_at / updated_at
```
Indexes: **`UNIQUE (source, external_id)`** ← makes re-sync idempotent and dedupe possible · `(institution_id)`

Built in Phase 1 even though integrations are Phase 4, because retrofitting provenance onto an already-populated table is painful.

### `institution_memberships` — the multi-tenancy core

```
id                    uuid PK
user_id               uuid NOT NULL FK → users ON DELETE CASCADE
institution_id        uuid NOT NULL FK → institutions ON DELETE CASCADE
role                  MembershipRole NOT NULL
status                MembershipStatus NOT NULL DEFAULT 'PENDING'
institution_member_id text NULL     -- roll number / staff ID. AN IDENTIFIER, NEVER A CREDENTIAL
joined_at             timestamptz NULL
left_at               timestamptz NULL
created_at / updated_at
```

Constraints:
- `UNIQUE (user_id, institution_id, role) WHERE left_at IS NULL` — a person may be *both* teacher and student at one institution, but not hold two active memberships of the same role
- `UNIQUE (institution_id, institution_member_id) WHERE institution_member_id IS NOT NULL AND left_at IS NULL`
- Indexes: `(institution_id, status)` · `(user_id)`

**`program_id` and `academic_session_id` are intentionally omitted** — adding nullable FKs to tables that do not exist yet is dead weight. They arrive in the migration that creates `programs`.

### How this supports the future entities

`programs`, `courses`, `enrollments`, `attendance`, `fees`, `hostel_*` all hang off `institution_id` and reference `institution_memberships.id` rather than `users.id` directly — so a student's academic records stay bound to *that institution relationship*, and follow the correct membership when the same person later enrolls elsewhere. That is precisely the identity requirement in the brief.

---

## H. Proposed folder structure

```
api/                              ← NEW NestJS service (backend/ stays frozen until cutover)
├── src/
│   ├── main.ts                   bootstrap, graceful shutdown, helmet, CORS
│   ├── app.module.ts
│   ├── config/                   env schema validation (fail fast on boot)
│   ├── common/
│   │   ├── guards/               JwtAuthGuard, RolesGuard, TenantGuard
│   │   ├── filters/              AllExceptionsFilter → the { success:false, error } shape
│   │   ├── interceptors/         ResponseEnvelope, RequestLogging
│   │   ├── decorators/           @CurrentUser, @Tenant, @Public, @PlatformRoles
│   │   ├── dto/                  PaginationQueryDto, PaginatedResponseDto
│   │   └── pipes/
│   ├── database/                 PrismaService (lifecycle + graceful disconnect)
│   ├── health/                   /api/v1/health — liveness + DB readiness
│   ├── auth/                     controller · service · strategies · dto
│   ├── users/
│   ├── institutions/             controller · service · repository · dto
│   └── memberships/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/               versioned, reviewable SQL
│   └── seed.ts                   deterministic; refuses to run in production
├── test/                         e2e — including tenant-isolation suite
├── Dockerfile                    multi-stage, non-root, healthcheck
└── .dockerignore

docker-compose.yml                ← root: postgres + api
.github/workflows/ci.yml          ← install → typecheck → lint → test → build → migrate validate
.gitignore                        ← root (currently MISSING — critical)
```

**Why `api/` and not replacing `backend/`:** the legacy Express server keeps the existing frontend alive while the new service is built and verified. Cutover becomes a one-line `REACT_APP_API_URL` change, and rollback is the same one line. `backend/` is deleted only after the frontend is confirmed green.

---

## I. Implementation sequence

Each stage ends with a verification gate. Nothing proceeds on a red gate.

| Stage | Work | Verification gate |
|---|---|---|
| **0.1** | Root `.gitignore`; untrack `node_modules` + `.env`; add `.env.example` | `git ls-files \| grep -c node_modules` → 0 |
| **0.2** | Rotate credentials; purge history *(needs your decision — see below)* | Secret scan clean |
| **0.3** | **Disable POST/PUT/DELETE on the legacy Express API** | curl DELETE → 405 |
| **1a** | Nest scaffold · strict TS · env validation · logger · exception filter · envelope interceptor · `/health` · graceful shutdown | `GET /api/v1/health` → 200 |
| **1b** | Prisma schema · first migration (+ hand-written partial indexes & CHECKs) · deterministic seed | `migrate dev` + `seed` clean; `psql \d` matches |
| **1c** | Auth: register · login · refresh-with-rotation · logout · guards · **server-side role assignment** | Register with `"role":"super_admin"` → **400** |
| **1d** | Institutions **read** API: pagination · search · filter · sort | 3 pages returned; `total` correct |
| **1e** | Institutions **write** API + memberships, behind guards | Unauthenticated write → 401 |
| **1f** | Test suite, **tenant isolation first** | Institution A user → Institution B data → **404** |
| **1g** | Dockerfile · compose · `.dockerignore` · GitHub Actions | Full pipeline green |
| **1h** | Frontend: dedupe cards/sections · delete dead code · `REACT_APP_API_URL` · cutover | Homepage renders from new API |

> **Stage 0.3 rationale:** the legacy write endpoints are the live security hole, but that code is being deleted in weeks. Building an auth system into it would be throwaway work. Disabling the routes is the smallest safe change that closes the hole — the correct fix ships as part of 1e.

---

## J. Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | Leaked Atlas credential already harvested from public GitHub | **Critical** | Assume compromised. Rotate anything reused. Cluster is already gone, limiting blast radius |
| 2 | Git history rewrite requires force-push; breaks any existing clone | **High** | Needs explicit approval. Alternative: leave history, rotate the secret, accept that the dead credential stays visible |
| 3 | No Postgres / no Docker daemon on this machine | **High** | Blocks all verification. Must be resolved before Stage 1b |
| 4 | Tenant isolation bug = cross-institution data breach | **Critical** | Single choke point + isolation tests written *before* the endpoints they protect |
| 5 | Frontend cutover regresses the homepage | Medium | Legacy backend stays running; cutover is one env var; rollback is the same env var |
| 6 | Prisma cannot express partial unique indexes in schema | Medium | Hand-written SQL in migrations, reviewed. Add a migration-content check to CI |
| 7 | Scope creep into Phase 2+ modules | Medium | Phase 1 is exactly 5 tables. Programs/courses/hostel are out of scope, by definition |
| 8 | `@node-rs/argon2` prebuilt unavailable for this platform | Low | Verify install at Stage 1c; fall back to `bcrypt` cost 12 |
| 9 | Fake seed data mistaken for real | Medium | `source = SEED` on every row; seed refuses to run when `NODE_ENV=production` |
| 10 | Zero existing tests → regressions invisible during migration | Medium | New service is test-first from Stage 1a; legacy backend is frozen, not modified |

---

## Decisions needed before STEP 3 (Phase 0)

1. **Postgres runtime** — start Docker Desktop, or install PostgreSQL 16 via Homebrew?
2. **Git history** — rewrite to purge the committed `.env` (requires force-push to a public repo), or leave history and rotate only?
3. **New backend location** — `api/` alongside the frozen `backend/` (recommended), or replace `backend/` in place?

No code will be modified until these are answered.
