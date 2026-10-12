# EduHub — Phase 2 Stage A Audit

**Date:** 2026-10-12
**Scope:** Inspection only. **No source code was modified.**
**Method:** Every finding below references a real file, command output, or configuration inspected in this session.

---

## 1. Baseline — actually executed

All commands run against the current working tree.

| Check | Command | Result |
|---|---|---|
| Backend typecheck | `npm run typecheck` | ✅ clean |
| Backend lint | `npm run lint` | ✅ clean |
| Backend build | `npm run build` | ✅ clean |
| Prisma schema | `npx prisma validate` | ✅ "schema is valid" |
| Migration state | `npx prisma migrate status` | ✅ "Database schema is up to date" (3 migrations) |
| E2E tests | `npm run test:e2e` | ✅ **85 / 85 passed**, 4 suites, 12.1 s |
| Frontend build | `CI=true npm run build` | ✅ compiled successfully |
| Compose config | `docker compose config` | ❌ **fails** — see C-2 |
| Docker image build | — | ⚠️ not executed |
| CI workflow | — | ⚠️ never run (needs a push) |

**This is a healthy baseline.** Nothing is broken; the findings below are about
structure, gaps and risk, not a failing build.

---

## 2. Findings

### 🔴 Critical

#### C-1 — The entire Phase 1 is uncommitted and the index is inconsistent

`git log` HEAD is still `de8dcd1 logo`, from before Phase 1 began.

```
staged:     2,173 files  (2,153 of them node_modules deletions)
unstaged:   ~20 modified/deleted
untracked:  api/  docs/  .github/  .gitignore  docker-compose.yml  .env.example
            frontend/.env.example  frontend/public/favicon.ico
            frontend/src/components/institutions/  frontend/src/hooks/useInstitutions.js
```

Two distinct risks:

1. **Total loss risk.** The whole backend (`api/`, 39 TypeScript files), all
   documentation, CI and Docker config exist only in this working tree.
2. **Inconsistent index.** The staged set contains renames whose targets were
   later deleted — `git status` reports `RD` entries, e.g.
   `frontend/src/components/collage/CollegeCard.jsx → colleges/CollegeCard.jsx`
   staged as a rename, while `colleges/` no longer exists on disk. A naive
   `git commit` would record a confusing history.

**Recommended fix:** stage deliberately in logical commits rather than
`git add -A`. Nothing should be refactored until this is committed.

> Per your rules I have not committed, pushed, or rewritten history.

#### C-2 — `docker compose` cannot start: no root `.env`

```
$ docker compose config
error while interpolating services.api.environment.JWT_ACCESS_SECRET:
required variable JWT_ACCESS_SECRET is missing a value
warning: "POSTGRES_PASSWORD" variable is not set
```

`docker-compose.yml` correctly uses `${JWT_ACCESS_SECRET:?...}` guards, so this
is the guard *working* — but only `.env.example` exists at the repo root, not
`.env`. The documented `docker compose up --build` therefore fails immediately
for any new developer.

**Note:** the Docker daemon **is running now** (Docker 29.5.2), so this is
verifiable for the first time. It was not verifiable in Phase 1.

---

### 🟠 High

#### H-1 — The frontend has no authentication integration at all

The API implements registration, login, refresh rotation, logout and `GET /auth/me`.
The frontend uses **none of it**:

| Missing | Evidence |
|---|---|
| Login / register UI | No auth files anywhere under `frontend/src` |
| Token storage | `accessToken` appears nowhere in `frontend/src` |
| `Authorization` header | `frontend/src/api/axiosClient.js` sets only `Content-Type` |
| 401 → refresh interceptor | No `axiosClient.interceptors` registered |
| Auth state / protected routes | No router installed at all |

`axiosClient` does set `withCredentials: true`, so the refresh cookie would be
sent — the transport is ready, the application layer is absent.

**This is the single biggest blocker for Phase 2.** Every feature on your
roadmap (student accounts, memberships, dashboards, reviews) requires a
logged-in user in the browser.

#### H-2 — No routing in the frontend

`react-router-dom` was removed in Phase 1 (its only consumer was dead code).
`frontend/src/App.js` renders `HomePage` directly. Institution detail,
login, and dashboards all need routes, so the router must come back before any
of them.

#### H-3 — Zero unit tests

`find api/src -name "*.spec.ts"` returns nothing. All 85 tests are e2e in
`api/test/`. The e2e suite is genuinely strong — including tenant isolation —
but it requires a live PostgreSQL, so pure logic is expensive to test:

- `auth/token.service.ts` — rotation and reuse detection (127 lines, the most
  security-sensitive logic in the codebase)
- `common/dto/pagination.dto.ts` — `totalPages` / `hasNext` arithmetic
- `common/utils/slugify.ts` — Unicode and diacritic handling

---

### 🟡 Medium

#### M-1 — Empty `api/src/users/` directory

`find api/src -type d -empty` returns exactly one result: `api/src/users`.
It contains no files and is registered in no module. User logic currently lives
inside `auth/auth.service.ts` (`PUBLIC_USER_SELECT`, `me()`).

Either build a real users module or delete the directory. Leaving an empty
folder implies a module that does not exist.

#### M-2 — Feature modules are not under `src/modules/`

Actual: `src/auth`, `src/institutions`, `src/memberships`, `src/health`.
Your target: `src/modules/auth`, etc.

This is a purely mechanical move, but it touches the import path of nearly
every file. **Low value, non-trivial churn.** My recommendation is in §4.

#### M-3 — Frontend structure will not scale

```
frontend/src/
├── api/          (2 files, global)
├── components/   common/ · institutions/ · layout/
└── hooks/        (1 file, global)
```

There is no `features/` boundary. With auth, memberships, reviews, hostel and
dashboards coming, a flat `components/` directory degrades quickly. The current
size (7 files, 535 lines) makes this the cheapest moment to restructure.

#### M-4 — `uniqueSlug` issues up to 5 sequential queries

`api/src/institutions/institutions.service.ts:131` loops up to five times,
awaiting a `findFirst` each pass. It is the only await-in-a-loop in the
codebase. Correct, but resolvable in a single query.

#### M-5 — Membership creation is check-then-write without a transaction

`memberships.service.ts` calls `findFirst` for a duplicate, then `create`.
Two concurrent requests could both pass the check.

**The database saves this:** the partial unique index
`memberships_user_institution_role_active` rejects the second write, Prisma
raises `P2002`, and the exception filter maps it to `409`. So the outcome is
correct — but the safety lives in the schema, not the service, and that should
be a deliberate, documented decision.

#### M-6 — Health endpoint returns an `error` key inside a success envelope

```json
{ "success": true, "data": { "status": "ok", "info": {...}, "error": {}, "details": {...} } }
```

That is Terminus's native shape passed through the response interceptor. A
consumer checking `response.data.error` gets a misleading signal.

#### M-7 — Missing infrastructure folders for planned work

`api/src/common/` has `decorators, dto, filters, guards, interceptors, types, utils`.
There is no `constants/`, no `pipes/`, and no top-level `integrations/` — the
latter is where Phase 4 external data imports belong.

Do not create these empty. Create each when its first real file exists.

---

### 🟢 Low

| ID | Finding |
|---|---|
| L-1 | Prisma warns `package.json#prisma` is deprecated and moves to `prisma.config.ts` in Prisma 7 |
| L-2 | Prisma CLI reports a newer version is available |
| L-3 | `frontend` browserslist / caniuse-lite data is ~11 months stale |
| L-4 | `docker-compose.yml:6` comment still says "the legacy backend is being retired" — it is already deleted |

---

## 3. What is working well — do not change it

Verified by reading the code, not the docs:

| Area | Evidence |
|---|---|
| **No cross-module coupling** | No feature module imports another feature's internals. Checked every file under `auth/`, `institutions/`, `memberships/`, `health/`. |
| **Database access is contained** | `PrismaService` is injected only in services, two guards, and the health check — not scattered through controllers. |
| **Consistent API envelope** | Success `{success, count?, data, meta?}`; error `{success, error:{code,message,details}, meta}`. Verified live against 4 endpoints. |
| **Auth defaults are safe** | `JwtAuthGuard` is global; routes opt out with `@Public()`. Roles are read from the database per request, never from the token body. |
| **Tenant isolation** | `TenantGuard` resolves the institution from the route, requires an ACTIVE membership, returns 404 (not 403). 15 e2e tests cover it. |
| **Schema integrity** | 16 `@@index`, 2 `@@unique`, 6 `onDelete` rules, plus 9 CHECK constraints and 4 partial unique indexes hand-written in migrations. |
| **No raw SQL in business code** | `$queryRaw` appears only in the health probe; `$executeRawUnsafe` only in test teardown. |
| **Secrets** | `api/.env`, `api/.env.test`, `frontend/.env.local` all confirmed gitignored. No secret values were read or printed. |
| **Docs match reality** | All 13 documented npm scripts exist; all 3 documented databases exist; `SHADOW_DATABASE_URL` is documented in `.env.example`. |

---

## 4. Proposed Stage B — smallest safe changes

Ordered by value. Each is independently revertible.

| # | Change | Files touched | Risk |
|---|---|---|---|
| B-1 | **Commit Phase 1** in logical commits, resolving the `RD` index entries | none (git only) | None — removes risk |
| B-2 | Create root `.env` from `.env.example`; run `docker compose up --build` and actually verify it | 1 new untracked file | Low |
| B-3 | Delete the empty `api/src/users/` directory | 1 dir | None |
| B-4 | Add unit tests for `TokenService`, `PaginationQueryDto`, `slugify` | 3 new files | None — additive |
| B-5 | Fix the health response shape so success payloads carry no `error` key | 1 file | Low — changes one response body |
| B-6 | Collapse `uniqueSlug` into a single query | 1 file | Low — covered by e2e |
| B-7 | Wrap membership create in `$transaction`, documenting the index as the real guard | 1 file | Low |
| B-8 | Update `docker-compose.yml` stale comment, refresh browserslist | 2 files | None |

### Deliberately NOT proposed

- **Moving features to `src/modules/`** (M-2). It rewrites the import path of
  nearly every file for zero behavioural gain, and would collide with the
  uncommitted-work problem in C-1. If you want it, it should be its own commit
  **after** B-1, done mechanically and verified by the existing 85 tests.
- **Restructuring the frontend into `features/`** (M-3). This is worth doing —
  but it should happen *together with* building the auth feature (H-1), so the
  folders are created by real code rather than moved twice.
- Any new product features, tables, or abstractions.

---

## 5. Recommended Phase 2 order

1. **B-1** — commit Phase 1. Nothing else until this is done.
2. **B-2** — verify Docker now that the daemon is available; push so CI runs.
3. **B-3, B-4** — trivial cleanup plus the missing unit tests.
4. **Frontend auth feature (H-1 + H-2 + M-3 together):** reinstate the router,
   create `features/auth/` with login and register pages, an auth context, the
   `Authorization` header, and a 401 → refresh interceptor. Build the
   `features/` structure here rather than as a separate move.
5. **Institution detail page** — `GET /institutions/:idOrSlug` already exists
   and no frontend code calls it.
6. **B-5 … B-8** — opportunistic hardening.

### Token storage recommendation

Keep the current split, which is already the safer design:

- **Refresh token** — stays in the existing httpOnly, SameSite=Lax cookie
  scoped to `/api/v1/auth`. JavaScript cannot read it, so XSS cannot exfiltrate it.
- **Access token** — hold **in memory only** (React context/state), never in
  `localStorage`. On page load, call `POST /auth/refresh` to mint a new one.

**Do not move tokens to `localStorage`** — anything stored there is readable by
any injected script. Because the refresh cookie is `SameSite=Lax` and the API is
cross-origin in development, CSRF exposure is limited, but once the frontend is
served from a different site in production you will need either a
same-site deployment or a CSRF token on the refresh endpoint. That decision
belongs with the deployment topology and should be made before launch, not now.

---

## 6. Risks that remain

| Risk | Severity | Status |
|---|---|---|
| Phase 1 exists only in an uncommitted working tree | **Critical** | Open — awaiting your approval to commit |
| Old MongoDB password still in git history (`dbb1f18`, `5d0c94e`, `a873f55`) | High | Accepted by you; cluster deleted, but treat the password as burned |
| Docker image build never executed | Medium | Now unblocked — daemon is running |
| CI workflow never executed | Medium | Requires a push |
| No unit tests; refactors rely entirely on e2e | Medium | Open (B-4) |
| Frontend cannot authenticate | High | Open — the main Phase 2 workstream |

---

## 7. Exact commands to run next

```bash
# 1. Review what would be committed (nothing is changed by this)
cd /Users/aman/Desktop/pratice/Managemnt-Project
git status
git diff --cached --stat -- . ':!*node_modules*'

# 2. Verify Docker now that the daemon is up
cp .env.example .env            # then set POSTGRES_PASSWORD and JWT_ACCESS_SECRET
openssl rand -hex 32            # generates a suitable secret
docker compose config           # should print the resolved config, no error
docker compose up --build

# 3. Re-run the baseline at any time
cd api && npm run typecheck && npm run lint && npm run build && npm run test:e2e
cd ../frontend && CI=true npm run build
```
