# Phase 1 — Login, Logout and the Super Admin Panel

**Status:** built, tested, not yet clicked through in a browser
**Date:** 2026-10-26
**Scope:** authentication, session management, platform administration UI

---

## 1. The big decisions

### 1.1 One database, not one per school

Three options existed. We chose the third.

| Approach | How it works | Why not |
|---|---|---|
| Database per school | `eduhub_school1`, `eduhub_school2`… | 100 schools = 100 databases and 100× migrations. "Search all schools" becomes impossible. Connection pool explodes. |
| Schema per school | One DB, one Postgres schema each | Same migration pain; Prisma handles it poorly |
| **Shared DB + tenant column** ✅ | One DB; every tenant row carries `institution_id` | Needs discipline so School A never reads School B's data |

The deciding factor: EduHub is a **discovery platform**. The public homepage must search across *all* institutions at once. With a database per school that query cannot be written.

The discipline problem is solved by one choke point — `api/src/common/guards/tenant.guard.ts`. Every tenant-scoped request flows through it. Postgres Row-Level Security can be layered underneath later without touching any service code.

> **Decision: one PostgreSQL database. No multi-DB.** Settled; do not revisit.

### 1.2 There is no "school login"

This is the most important idea in the system.

A school is **not** a user. A school is a row in `institutions`. People log in, and a person is *connected* to a school by a **membership** row.

```
users                    institution_memberships              institutions
┌──────────────┐         ┌──────────────────────────┐        ┌─────────────┐
│ id           │────────▶│ user_id                  │        │ id          │
│ email        │         │ institution_id           │◀───────│ name        │
│ password_hash│         │ role (STUDENT/TEACHER/   │        │ slug        │
│ platform_role│         │       STAFF/INST_ADMIN)  │        │ status      │
└──────────────┘         │ status (PENDING/ACTIVE)  │        └─────────────┘
                         └──────────────────────────┘
```

Why not `user.institution_id` (one school per user)? Because it cannot express a student who transfers schools, or a teacher who also studies at the same institution. Memberships begin and end; the account is permanent.

### 1.3 Two separate layers of power

| Layer | Column | Values | Means |
|---|---|---|---|
| **Platform** | `users.platform_role` | `USER`, `PLATFORM_ADMIN`, `SUPER_ADMIN` | Authority over the whole site |
| **Tenant** | `institution_memberships.role` | `STUDENT`, `TEACHER`, `STAFF`, `INSTITUTION_ADMIN` | Authority inside **one** school |

Deliberately separate. Real cases:

- Alice is `USER` platform-wide but `INSTITUTION_ADMIN` at Northgate → manages that one school, nothing else.
- Carla could be `STUDENT` at one school and `TEACHER` at another → two membership rows, no conflict.
- The platform owner is `SUPER_ADMIN` → sees everything.

### 1.4 One login endpoint for everybody

```
POST /api/v1/auth/login     ← super admin, school admin, teacher, student. All of them.
```

Nobody picks "log in as a school" from a dropdown. You sign in, and the system tells you what you are:

```json
{ "success": true,
  "data": {
    "user": { "email": "...", "platformRole": "SUPER_ADMIN", "status": "ACTIVE" },
    "accessToken": "eyJhbGc..." } }
```

The **frontend** then decides where to send you (`frontend/src/auth/landing.js`):

| Who | Goes to |
|---|---|
| `SUPER_ADMIN` or `PLATFORM_ADMIN` | `/admin` |
| Everyone else | `/` (public homepage) |

> ⚠️ That routing is **convenience only**. Real security is on the backend guards. A student who types `/admin` gets a redirect from React and a `401`/`403`/`404` from the API.

---

## 2. How login and logout actually work

Two tokens, which is the correct modern pattern.

| Token | Lifetime | Stored | Purpose |
|---|---|---|---|
| **Access token** (JWT) | 15 min | Browser **memory only** | `Authorization: Bearer …` on every request |
| **Refresh token** (32 random bytes) | 30 days | `httpOnly` cookie | Only used to mint a new access token |

### Why not one token?

A JWT cannot be cancelled — it is valid until it expires. A stolen 30-day JWT would be unstoppable for 30 days. So: a short JWT, plus a refresh token stored in `refresh_tokens` that **can** be revoked. That is what makes logout real.

### The flow

```
LOGIN
  browser ──POST /auth/login {email,password}──▶ API
                                                 │ find user by email (stored lowercase)
                                                 │ argon2id verify password
                                                 │ check status == ACTIVE
                                                 │ insert refresh_tokens row (SHA-256 only)
                                                 ▼
  browser ◀── accessToken in JSON + refresh token in httpOnly cookie

EVERY REQUEST
  browser ──Bearer <jwt>──▶ JwtAuthGuard → JwtStrategy
                              │ verify signature + expiry
                              │ re-read the user FROM THE DATABASE   ← important
                              │ check status and tokenVersion
                              ▼ req.user = { id, platformRole }

AFTER 15 MIN (401)
  axios interceptor ──POST /auth/refresh (cookie sent automatically)──▶
                       old refresh row revoked, new pair issued (rotation)

LOGOUT              refresh row revoked + cookie cleared
LOGOUT-ALL          tokenVersion incremented + every refresh row revoked
```

### Five security properties worth knowing

1. **The role comes from the database, not the token.** `jwt.strategy.ts` re-reads the user on every request. Demote someone and they lose power *instantly*, not in 15 minutes.
2. **`tokenVersion` is the kill switch.** Increment it and every outstanding access token for that user dies at once.
3. **Refresh rotation with reuse detection.** Each refresh invalidates the old token. Replaying a consumed token revokes the whole `familyId` — every session in that chain dies.
4. **Uniform login failure.** A wrong email and a wrong password return the identical message, so the endpoint cannot be used to discover which addresses are registered.
5. **Tenant denial is `404`, not `403`.** A `403` would confirm that an institution the caller cannot see exists.

### Why the token is in memory, not `localStorage`

Anything in web storage is readable by any script on the page, so a single XSS payload steals the session. A module variable dies with the tab, and the session survives a reload through the `httpOnly` refresh cookie — which JavaScript cannot read at all.

### Single-flight refresh

The API treats a reused refresh token as theft and revokes the whole family. Five parallel requests hitting an expired token would fire five refreshes; four would look like replays and the user would be logged out just for loading a page. So `axiosClient.js` shares **one** refresh promise between all callers.

---

## 3. What was built

### 3.1 Authentication endpoints

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/v1/auth/register` | public | Always `platformRole: USER`. 5 req/min. |
| POST | `/api/v1/auth/login` | public | 10 req/min |
| POST | `/api/v1/auth/refresh` | cookie | Rotates; reuse revokes the family |
| POST | `/api/v1/auth/logout` | public | Public on purpose — must work with an expired access token |
| POST | `/api/v1/auth/logout-all` | **authenticated** | Affects sessions you are not holding, so it needs proof of ownership |
| GET | `/api/v1/auth/me` | authenticated | Returns `{ user, memberships }` |

`/auth/me` returns only **ACTIVE** memberships. A `PENDING` request is not access — showing it would make the UI offer a dashboard that every request behind it answers with `404`.

### 3.2 Institution administration

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/v1/institutions` | public | Staff see every status; everyone else only `PUBLISHED` |
| GET | `/api/v1/institutions/:idOrSlug` | public | Same rule |
| POST | `/api/v1/institutions` | platform admin | Always created as `DRAFT` |
| PATCH | `/api/v1/institutions/:id` | platform admin | Content only — **no** `status` |
| PATCH | `/api/v1/institutions/:id/status` | platform admin | **New.** Publication lifecycle |
| DELETE | `/api/v1/institutions/:id` | platform admin | Soft delete → `ARCHIVED` + `deletedAt` |
| GET | `/api/v1/institutions/:id/memberships` | member or platform admin | Platform staff get a cross-tenant override |

#### The blocker this fixed

**There was no way to publish an institution.** `create` hardcodes `DRAFT` and `status` is deliberately excluded from the PATCH whitelist (the e2e suite asserts this). An admin UI could only ever create records nobody could see.

Rather than open up the general PATCH — which would break a tested security invariant — publishing became its own endpoint with an explicit allow-list:

```
DRAFT          → PENDING_REVIEW, PUBLISHED
PENDING_REVIEW → PUBLISHED, DRAFT
PUBLISHED      → SUSPENDED, DRAFT
SUSPENDED      → PUBLISHED, DRAFT
ARCHIVED       → (nothing)
```

- `ARCHIVED` as a target is **rejected** with a pointer to `DELETE`. Archiving must also set `deletedAt`, otherwise the slug stays reserved and the row keeps appearing in staff listings.
- `verifiedAt` is stamped the **first** time a record reaches `PUBLISHED` and never cleared. It records that a human once approved it — still true even after a later suspension.

### 3.3 User administration

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/v1/users` | platform admin | Paginated; search email + name; filter role/status |
| GET | `/api/v1/users/:id` | platform admin | One user with memberships |
| GET | `/api/v1/users/stats` | platform admin | Counts for the overview |
| PATCH | `/api/v1/users/:id/status` | platform admin | `ACTIVE` or `SUSPENDED` only |

Four deliberate refusals:

1. **Suspension takes effect now.** It bumps `tokenVersion` **and** revokes refresh rows in one transaction with the status change. An account suspended for abuse that keeps working for another 15 minutes is not suspended.
2. **You cannot change your own status.** Easy mistake; recoverable only with database access.
3. **A `PLATFORM_ADMIN` cannot touch a `SUPER_ADMIN`.** Otherwise the lesser role neutralises the greater one.
4. **No endpoint grants a platform role — at all.** Promotion requires database access (`npm run create:superadmin`). A test asserts `{status, platformRole:"SUPER_ADMIN"}` and similar shapes all return `400`.

Also absent on purpose: no `POST /users` (people register themselves) and no `DELETE /users` (deleting cascades memberships away and destroys audit history — suspension is the reversible, auditable action).

`PENDING_VERIFICATION` and `DEACTIVATED` are **not** assignable by staff. The first belongs to the email-verification flow that does not exist yet; the second is the user's own decision to close their account. Letting an admin set either would mean staff could fake a verified address, or make a closed account indistinguishable from a banned one.

### 3.4 Frontend routes

| Route | Guard | What it does |
|---|---|---|
| `/` | — | Public homepage; header now has Sign in / Dashboard / Sign out |
| `/login` | — | Email + password, error and loading states |
| `/admin` | `SUPER_ADMIN`, `PLATFORM_ADMIN` | Overview — 8 real counts, each tile links to a filtered list |
| `/admin/institutions` | same | Search + status/category filters + pagination + row actions |
| `/admin/institutions/new` | same | Create form |
| `/admin/institutions/:id` | same | Edit + lifecycle buttons + members panel |
| `/admin/users` | same | Search + role/status filters + suspend/reactivate |

Design notes:

- **Filters live in the URL.** A filtered list is then shareable and survives a reload or a back-navigation out of an edit screen — which matters when working through a review queue.
- **Confirmation dialogs are React, not `window.confirm`.** A native dialog blocks the JS thread, cannot say what will actually happen, and cannot show the error if the request then fails.
- **Session state is three-valued** (`loading` / `authed` / `anon`). A boolean cannot express "we have not asked the server yet", and routes that guess during that gap bounce a signed-in user to `/login` on every refresh.
- **No dashboard numbers are invented.** Every figure is a real count from the API. No revenue tiles, no growth percentages, no activity charts — nothing in the database can answer them yet, and somebody eventually makes a decision with a fake number.
- **No "Forgot password" link.** Password reset needs email delivery, which does not exist. A link to a dead end is worse than no link.

---

## 4. Files

### Added

```
api/prisma/create-super-admin.ts                       production-safe super-admin creation
api/src/institutions/dto/update-institution-status.dto.ts
api/src/users/users.controller.ts
api/src/users/users.service.ts
api/src/users/users.module.ts
api/src/users/dto/query-users.dto.ts
api/src/users/dto/update-user-status.dto.ts
api/test/admin.e2e-spec.ts                             26 tests

frontend/src/api/authApi.js
frontend/src/api/adminApi.js
frontend/src/api/apiError.js
frontend/src/auth/AuthContext.jsx                      session state, restore-on-load
frontend/src/auth/ProtectedRoute.jsx                   ProtectedRoute + RoleRoute
frontend/src/auth/landing.js                           post-login routing
frontend/src/hooks/useDebouncedValue.js
frontend/src/components/ui/Badge.jsx
frontend/src/components/ui/Pagination.jsx
frontend/src/components/ui/ConfirmDialog.jsx
frontend/src/components/ui/Field.jsx
frontend/src/components/ui/TableStates.jsx
frontend/src/pages/LoginPage.jsx
frontend/src/pages/admin/AdminLayout.jsx
frontend/src/pages/admin/AdminDashboardPage.jsx
frontend/src/pages/admin/InstitutionsListPage.jsx
frontend/src/pages/admin/InstitutionFormPage.jsx
frontend/src/pages/admin/InstitutionMembersPanel.jsx
frontend/src/pages/admin/UsersListPage.jsx
frontend/src/pages/admin/enums.js
```

### Changed

```
api/src/auth/auth.service.ts            /me returns memberships; added logoutAll()
api/src/auth/auth.controller.ts         added POST /auth/logout-all
api/src/institutions/institutions.service.ts   added changeStatus() + transition matrix
api/src/institutions/institutions.controller.ts added PATCH :id/status
api/src/app.module.ts                   registered UsersModule
api/prisma/seed.ts                      seeds a SUPER_ADMIN; prints all demo logins
api/package.json                        added "create:superadmin"
api/tsconfig.build.json                 excludes all of prisma/ (see note below)
api/test/auth.e2e-spec.ts               6 new tests
api/.env.example                        documented SUPER_ADMIN_* vars

frontend/package.json                   added react-router-dom 6.30.1
frontend/src/App.js                     router + AuthProvider
frontend/src/api/axiosClient.js         bearer injection, 401→refresh→retry, single-flight
frontend/src/components/common/Header.jsx  Sign in / Dashboard / Sign out
```

**Note on `tsconfig.build.json`:** it previously excluded `prisma/seed.ts` by name. Adding a second script to `prisma/` silently pulled the directory into compilation, which moved the build output to `dist/src/main.js` and broke `start:prod`. It now excludes the whole `prisma/` directory — those scripts run through ts-node and are never part of the server bundle.

---

## 5. How to run it

### 5.1 First time

```bash
# 1. Database (a native Postgres on :5432 also works)
docker compose up -d postgres

# 2. Environment
cp api/.env.example api/.env
openssl rand -hex 32          # paste into JWT_ACCESS_SECRET

# 3. Schema + demo data
cd api
npm run prisma:migrate
npm run db:seed
```

### 5.2 Every time

```bash
cd api && npm run start:dev          # → http://localhost:4000
cd frontend && npm start             # → http://localhost:3000
```

> Always open `http://localhost:3000`, **not** `http://127.0.0.1:3000`. The
> browser treats them as different sites: the API's `CORS_ORIGINS` only allows
> `localhost`, and the refresh cookie set by `localhost:4000` is not sent from a
> `127.0.0.1` page, so every request fails with a CORS error. If `localhost`
> itself will not load, start the frontend with `HOST=:: npm start` (the dev
> server binds IPv4 only, and some browsers try IPv6 `::1` first).

### 5.3 Demo accounts (development only)

| Role | Email | Password |
|---|---|---|
| `SUPER_ADMIN` | `super.admin@eduhub.test` | `DevPassword123` |
| `PLATFORM_ADMIN` | `platform.admin@eduhub.test` | `DevPassword123` |
| School admin (Northgate) | `alice.admin@eduhub.test` | `DevPassword123` |
| School admin (Riverside) | `bob.admin@eduhub.test` | `DevPassword123` |
| Student (Northgate) | `carla.student@eduhub.test` | `DevPassword123` |

### 5.4 A real super admin (production)

```bash
cd api
SUPER_ADMIN_EMAIL=you@example.com \
SUPER_ADMIN_PASSWORD='<12+ chars, upper + lower + digit>' \
SUPER_ADMIN_NAME='Your Name' \
npm run create:superadmin
```

Safe to run in production: it creates exactly one account, invents no password, prints no secret, and is idempotent.

If the email already exists it **promotes** that account and **leaves the password alone** — otherwise a typo in `SUPER_ADMIN_EMAIL` becomes an account takeover.

### 5.5 Checking it works

```bash
cd api && npm run test:e2e       # fastest proof — 116 tests
cd api && npm run typecheck
cd api && npm run lint
cd api && npm run prisma:studio  # browse the database
cd frontend && npm run build
```

Manual smoke test, in order:

1. Sign in at `/login` as `super.admin@eduhub.test` → lands on `/admin`
2. **Reload the page** → still signed in (session restored from the cookie)
3. `/admin/institutions` → **New institution** → fill name, category, country code → Create
4. On the edit screen → **Publish** → confirm
5. Open `/` → the new institution appears in the public list
6. Back in `/admin/institutions` → **Archive** it
7. `/admin/users` → confirm **Suspend** is greyed out on your own row
8. **Sign out** → confirm `/admin` now redirects to `/login`
9. Sign in as `carla.student@eduhub.test` → type `/admin` in the URL → bounced home

---

## 6. Verification status

| Check | Result |
|---|---|
| API typecheck | pass |
| API lint | pass |
| e2e tests | **116 passed, 5 suites** |
| Frontend production build | compiled successfully |

Confirmed live against a running server and a real database:

- Super admin login returns `platformRole: SUPER_ADMIN` and sets the refresh cookie
- `/auth/me` for Alice returns her Northgate `INSTITUTION_ADMIN` membership
- `logout-all` kills both devices' access tokens *and* refresh cookies → all `401`
- `logout-all` with no token → `401`
- Create → `DRAFT`; publish → `verifiedAt` stamped
- Illegal transition → `"Cannot go from PUBLISHED to PENDING_REVIEW. Allowed: SUSPENDED, DRAFT"`
- Anonymous sees 12 published; admin additionally sees the draft
- Platform admin reads Northgate's 2 members without holding a membership
- `PATCH {"phone":null}` genuinely nulls the column
- No `passwordHash` or `tokenVersion` in any user response
- `create:superadmin`: weak password rejected · idempotent re-run · promote without password change
- Soft delete returns `{id, deleted:true}`

### ⚠️ Not verified

**No screen has been opened in a browser.** The Chrome extension used for automated checks reported *"Browser extension is not connected"*, so UI verification could not be completed. Every page compiles and every endpoint behind it is proven by curl and tests, but **nobody has clicked these buttons yet.** Section 5.5 is the checklist to run.

---

## 7. Known limitations

| # | Limitation | Why |
|---|---|---|
| 1 | **Members panel is read-only** | `POST .../memberships` exists but needs a user UUID, and there is no "find a person by email" endpoint. A field demanding a hand-pasted UUID is not a usable feature. |
| 2 | **A coordinate cannot be cleared** | The API transform maps `null` → `undefined` for lat/lng, so a cleared value is silently kept. The form warns the user rather than pretending. Text fields *can* be cleared. |
| 3 | **No password reset** | Needs email delivery |
| 4 | **No email verification** | Accounts are created `ACTIVE` with `emailVerifiedAt` null. Gating login on a verification email that cannot be sent would be fake functionality. |
| 5 | **No school/student dashboards** | Phase 2. `landingPathFor` sends non-staff to `/` rather than to a route that does not exist. |
| 6 | **No audit log** | Who published what, who suspended whom. The lifecycle endpoint is already shaped to attach one. |
| 7 | **No institution media upload** | Phase 1 stores image URLs only; no S3. |
| 8 | **Create React App** | Deprecated and slow. Kept so Phase 1 stayed focused; migrating to Vite is its own task. |

---

## 8. Suggested next steps

Roughly in value order:

1. **Run the manual smoke test** (§5.5) and report anything broken.
2. **User lookup endpoint** — `GET /users?search=` already exists; wire it into an "add member" picker to make the members panel writable. Unblocks limitation #1.
3. **Audit log** — one append-only table, written by the two lifecycle endpoints. Cheap now, painful to backfill later.
4. **School admin dashboard** — `/school/:slug`, using the memberships already returned by `/auth/me`. The commented-out branch in `landing.js` marks the spot.
5. **Email delivery** — unlocks password reset *and* email verification together.
6. **Vite migration** — mechanical, isolated, no behaviour change.
