# Phase 1 — Implementation Review (STEP 9)

**Date:** 2026-09-09
**Preceded by:** `EDUHUB_AUDIT.md` (inventory) · `EDUHUB_ARCHITECTURE.md` (plan)

---

## Verification results

Every item below was executed, not assumed.

| Gate | Command | Result |
|---|---|---|
| Type check | `npm run typecheck` | ✅ clean (TS strict) |
| Lint | `npm run lint` | ✅ clean |
| Build | `npm run build` | ✅ clean |
| Migrations | `prisma migrate deploy` | ✅ 3 applied, no drift |
| Drift check | `prisma migrate diff --exit-code` | ✅ "No difference detected" |
| Seed | `npm run db:seed` | ✅ 4 users · 12 institutions · 48 media · 3 memberships |
| E2E tests | `npm run test:e2e` | ✅ **85/85 passing**, 4 suites |
| Frontend build | `CI=true npm run build` | ✅ 77.84 kB gzipped |
| API smoke | 30+ curl assertions | ✅ all passed |
| CORS | preflight from `localhost:3000` | ✅ 204 + correct headers |
| Services | api · frontend · postgres | ✅ all responding |

### Test suites

| Suite | Tests | Covers |
|---|---|---|
| `tenant-isolation.e2e-spec.ts` | 15 | Cross-tenant read/write, 404-not-403, body injection, role escalation |
| `auth.e2e-spec.ts` | 26 | Privilege escalation, validation, login, rotation, reuse detection, revocation |
| `institutions.e2e-spec.ts` | 42 | Envelope, pagination, filtering, visibility, authorization, soft delete |
| `throttling.e2e-spec.ts` | 2 | Rate limiting |

---

## Phase 0 — security remediation

| Problem | Fix | Verified |
|---|---|---|
| `.env` committed with live DB credentials | Untracked; credential stripped from working tree; `.env.bak` deleted | 0 matches for the credential anywhere on disk |
| No `.gitignore` | 48-line root `.gitignore` | `.env`, `.env.test`, `.env.local` all report IGNORED |
| `node_modules` committed (2,153 files) | `git rm -r --cached` | Tracked files **2,210 → 56**; files intact on disk |
| Public write endpoints | Legacy POST/PUT/PATCH/DELETE return `405` | curl: all four → 405; GETs still 200 |
| Startup race (DB not awaited) | `await connectDB()` before `listen` | Log order now correct |
| Error leakage (`err.message`) | Centralised handler, generic messages | — |
| CORS hardcoded | `CORS_ORIGINS` env var | — |
| Destructive "migration" that drops the collection on import | Deleted `migrate.js` + `institution.migration.js` | — |

**Git history was left intact** per your decision. The old Atlas credential remains visible in commits `dbb1f18`, `5d0c94e`, `a873f55`. The cluster is deleted, but **treat that password as burned anywhere it was reused.**

---

## What was built

### Files created — 65 in `api/`

Config (7) · Prisma schema + 3 migrations + seed (5) · common guards/filters/interceptors/decorators/types (13) · auth module (8) · institutions module (6) · memberships module (4) · health (2) · bootstrap (2) · tests (6) · Docker/lint/tsconfig (7)

Plus at the root: `docker-compose.yml`, `.github/workflows/ci.yml`, `.gitignore`, `.env.example`, and a rewritten `README.md`.

### Database — 6 tables

`users` · `refresh_tokens` · `institutions` · `institution_external_ids` · `institution_media` · `institution_memberships`

With **9 CHECK constraints**, **4 partial unique indexes**, **2 GIN trigram indexes**, and full FK coverage.

`institution_media` was added beyond the original 5-table plan: the brief requires the homepage keep working, and the card UI is image-driven. A separate table rather than a `String[]` column because images need ordering, alt text, and per-image licence provenance.

### Frontend

| Before | After |
|---|---|
| `SchoolCard` + `CollegeCard` (95% identical) | one `InstitutionCard` |
| `SchoolsSection` + `CollegesSection` | one `InstitutionsSection` |
| `useFetchInstitutions` (double-filtered, capped at 50) | `useInstitutions` (real server pagination) |
| Search input with no handler | Debounced search wired to the API |
| Hardcoded `baseURL` | `REACT_APP_API_URL` |
| Random star ratings | removed entirely |
| `components/collage/` | `components/institutions/` |

**Deleted:** `components/HomePage.jsx` (240-line orphan), `routes/AppRoutes.jsx` (imported 5 nonexistent files), `SectionTitle.jsx`, `logo.svg`, `models/data/institutions.json`, `bootstrap` and `react-router-dom` dependencies.

**Also deleted — flagging explicitly, this is reversible from git:** `components/teachers/`, `components/students/`, `components/data/`. These rendered invented teacher posts and student projects as though real, for modules that do not exist in the backend. Same class of problem as the fake ratings. If you want them back as visual placeholders, `git checkout` restores them.

---

## Mistakes made during this phase

Reported because they cost real time and one caused data loss.

### 1. I wiped the development database

While verifying the CI drift-check command, I ran:

```
prisma migrate diff … --shadow-database-url "$DATABASE_URL"
```

**Prisma drops and recreates the shadow database.** `$DATABASE_URL` pointed at `eduhub_dev`, so it destroyed the migration ledger and all seed data.

Only regenerable seed data was lost — no real data existed. Recovery was non-destructive (`migrate resolve --applied` to rebuild the ledger, then re-seed).

**The same bug was in the CI workflow I had just written**, where it would have wiped the test database mid-pipeline. Fixed three ways: a dedicated `eduhub_shadow` database, `shadowDatabaseUrl` declared in `schema.prisma` so it can never fall back silently, and a warning in `.env.example`.

### 2. Prisma silently dropped hand-written indexes

I created the trigram GIN indexes in raw migration SQL. Prisma treated them as drift and dropped them on the next `migrate dev`. Fixed by declaring them in `schema.prisma` so Prisma owns them. Partial unique indexes and CHECK constraints are unaffected — Prisma does not manage those.

### 3. `@IsUUID('4')` rejected every real id

Our ids are UUIDv7. Caught by a smoke test.

### 4. `@Public()` routes had no `req.user`

The guard short-circuited before authenticating, so platform admins were treated as anonymous on public routes and could not see drafts. Caught by an e2e test. Fixed with genuine optional authentication.

---

## Known issues and remaining work

| # | Issue | Severity | Notes |
|---|---|---|---|
| 1 | **Docker never executed** | Medium | The daemon is not running on this machine. Dockerfile and compose are written and syntactically valid but **unverified at runtime**. Start Docker Desktop and run `docker compose up --build` before trusting them. |
| 2 | **CI never executed** | Medium | Same — the workflow is written but has not run. Its individual commands were each verified locally. |
| 3 | Chrome shows a stale cached app on `localhost:3000` | Low | A service worker from a previous project ("LIMS") is intercepting the origin. Not caused by these changes. Fix: DevTools → Application → Service Workers → Unregister, then hard-reload. The dev server serves the correct HTML (`curl` confirms). |
| 4 | No unit tests | Low | Only e2e. The e2e suite exercises the real graph, so coverage is genuine, but unit tests for `TokenService` rotation logic would be cheaper to run. |
| 5 | Prisma config deprecation warning | Low | `package.json#prisma` moves to `prisma.config.ts` in Prisma 7. |
| 6 | Email verification not implemented | Low | Accounts are created `ACTIVE` with `emailVerifiedAt` null. Gating login on verification without the ability to send email would be fake functionality. Phase 2. |
| 7 | Legacy `backend/` still present | Low | Read-only. Delete once the cutover has run cleanly for a while. |
| 8 | Frontend has no auth UI | Expected | The API supports auth; no sign-in screen exists yet, so the Profile button was removed rather than left as a dead control. |
| 9 | `browserslist`/`caniuse-lite` 11 months stale | Low | `npx update-browserslist-db@latest`. |

---

## What is running now

| Service | URL | State |
|---|---|---|
| API | http://localhost:4000/api/v1 | ✅ running |
| Frontend | http://localhost:3000 | ✅ running |
| PostgreSQL | localhost:5432 | ✅ `eduhub_dev`, `eduhub_test`, `eduhub_shadow` |
| Legacy Express | localhost:5000 | stopped (read-only when run) |

**Demo accounts** (development only, password `DevPassword123`):

| Email | Role |
|---|---|
| `platform.admin@eduhub.test` | Platform admin |
| `alice.admin@eduhub.test` | Institution admin — Northgate |
| `bob.admin@eduhub.test` | Institution admin — Riverside |
| `carla.student@eduhub.test` | Student — Northgate |

Alice and Bob administer different institutions — the fixture for testing tenant isolation by hand.

---

## Recommended next steps

1. **Start Docker Desktop and run `docker compose up --build`** — closes the one untested deliverable.
2. **Push and let CI run** — closes the second.
3. **Decide on the teachers/students sections** — restore as placeholders, or leave removed until those modules exist.
4. **Phase 2**: email verification, password reset, institution media upload, and the sign-in UI that brings the Profile button back for real.
