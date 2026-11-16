# EduHub: Implementation Audit

**Date:** 2026-11-16
**Scope:** everything in the working tree, including the 77 uncommitted files, measured against the LinkedIn-style product direction.
**Method:** read the backend, frontend, schema and migrations; ran the checks listed in §0; made a few live HTTP calls against the dev server.
**No code was changed during this audit.** This document is the only file added.

---

## 0. What was actually run (evidence)

| Check | Result | Notes |
|---|---|---|
| API typecheck (`tsc --noEmit`) | **Pass** | |
| API lint (eslint) | **Pass** | No output |
| API unit tests | **2 / 2 pass** | Only one unit spec (the mail provider) |
| API e2e tests (real Postgres `eduhub_test`) | **268 / 268 pass, 9 suites** | auth, email flows, institutions, tenant isolation, profiles, school dashboard, admin, super admin, throttling |
| Frontend tests | **39 / 39 pass, 5 suites** | Run earlier this session after adding the schema page |
| Frontend production build | **Not run** in this audit | Running it would overwrite `frontend/build` |
| Migrations vs dev DB | **Up to date**, 5 migrations | `prisma migrate status` |
| Full schema replay on an empty DB | **Pass** | Done earlier this session (`docs/database/schema.sql`) |
| Live API | **Running.** Health returns 200, public institution list returns 200 | |
| `npm audit` API (runtime deps) | **4 high** | `prisma`, `zod`, `deepmerge-ts` (via `@prisma/config`) |
| `npm audit` frontend | **72 total (3 critical, 37 high)** | Most come from `react-scripts` 5 build tooling. `axios` and `react-router` are **high** and ship in the browser bundle |
| Docker / Compose | **Not verified** | Only the files were read; no images were built |
| GitHub Actions CI | **Not verified** | Most of the current work is uncommitted, so CI has never run on it |
| Browser click-through | **Not done** in this audit | |

Status labels below follow the brief. "Complete and verified" means the backend, database, permissions **and** passing e2e tests all exist in this run. A frontend page on its own never counts as complete.

---

## 1. Current architecture overview

```
frontend/  React 19 (Create React App / react-scripts 5) + Tailwind + react-router 6
           axios client: access token kept in memory only; refresh token in an
           httpOnly cookie; one refresh call shared by concurrent requests on a 401
     │  HTTPS JSON  /api/v1/...   envelope {success, data, meta}
     ▼
api/       NestJS 11, modular monolith. Global guards run in this order:
           Throttler → JwtAuth (@Public opt-out) → PlatformRoles → TenantGuard
           Global ValidationPipe (whitelist + forbidNonWhitelisted), helmet,
           pino logging with request ids and redaction, AllExceptionsFilter,
           env checked with zod at boot (refuses unsafe production settings)
     │  Prisma 6
     ▼
PostgreSQL 16  9 tables, pg_trgm; uniqueness and CHECK rules are written by
               hand in migration SQL (partial unique indexes, append-only audit trigger)
```

**Two independent role axes.** This is a good design.
- `users.platform_role`: USER / PLATFORM_ADMIN / SUPER_ADMIN. These are EduHub staff.
- `institution_memberships.role`: STUDENT / TEACHER / STAFF / INSTITUTION_ADMIN. These apply per institution and are checked on every request by `TenantGuard`.

**Overall verdict on architecture:** modular, consistent and well commented, with no dead layers. Every module follows the same controller → service → Prisma pattern with DTO validation. The codebase is small (about 5.4k lines of backend TypeScript) and is not over-engineered. It is a solid base to extend rather than rebuild.

## 2. Existing modules and functionality

| Backend module | What it does |
|---|---|
| `auth` | Register, login, refresh (rotation with family reuse detection), logout, logout-all, `/me`, email verification, resend verification, forgot/reset password, argon2 hashing |
| `mail` | console / memory / SMTP providers. Production refuses any provider except SMTP |
| `profiles` | `GET/PATCH /profiles/me`, visibility (PUBLIC / MEMBERS / PRIVATE), public `GET /profiles/:userId`, education history **derived from memberships** |
| `institutions` | Public list/search/filter/paginate, get by id or slug; staff create/update/status workflow/soft delete, with audit |
| `memberships` | Per-institution member list, lookup by email, add, change role, change status, "last admin" protection with a row lock |
| `institution-dashboard` | Per-institution overview for INSTITUTION_ADMIN and STAFF |
| `users` | Staff list/search/detail; suspend/reactivate (kills sessions); SUPER_ADMIN changes platform roles |
| `admin` | Overview KPIs, registration analytics, distributions, activity, approvals queue, system health, settings (SUPER_ADMIN only) |
| `audit` | Append-only audit log, written inside the same transaction as the change, plus a staff query API |
| `health` | `GET /api/v1/health` with a database ping |

| Frontend area | Pages |
|---|---|
| Public | Home (institution discovery), login, register, forgot/reset password, verify email, public profile `/u/:userId` |
| Signed-in user | `/profile` (edit profile + education), `/school` picker, `/school/:slug` dashboard and member management |
| Admin | Dashboard, Institutions (list/create/edit/status), Users (list/detail/suspend/role), Roles, Countries, Approvals, Analytics, Audit Logs, Settings, System Health, Search, Database Schema (temporary). Academic / Moderation / Admissions / Notifications are honest "planned" pages |

## 3. Feature-by-feature matrix

### Accounts and authentication
| Feature | Current status | Existing implementation | Missing work | Priority |
|---|---|---|---|---|
| Registration and login | Complete and verified | `auth` module, `auth.e2e-spec` | Login fails faster for unknown emails than for wrong passwords (no hash is checked), which leaks whether an account exists. Register returns 409 for a taken email (also an enumeration risk, accepted trade-off) | P1 |
| Access and refresh tokens, rotation, logout | Implemented, with a concurrency gap | `TokenService.rotate`, family revoke on reuse | Rotation is check-then-act, not atomic (§5 S2). `replaced_by_id` is never written | P0 |
| Logout-all and session kill | Complete and verified | `tokenVersion` bump plus revoke | | |
| Email verification | Complete and verified | `email_tokens`, `email-flows.e2e-spec` | Login is intentionally not gated on verification; only joining an institution requires it | |
| Password reset | Complete and verified | Single-use hashed token, revokes all sessions | | |
| Change password while signed in | **Not implemented** | | Endpoint plus UI | P1 |
| Delete or deactivate own account | **Not implemented** | `deleted_at` column exists | Self-service delete/deactivate (data-protection requirement) | P2 |
| Platform roles and staff permissions | Complete and verified | `PlatformRolesGuard`, `super-admin.e2e-spec` | | |
| Suspend / reactivate account | Complete and verified | `users.service` kills sessions on suspend | | |
| Rate limiting | Implemented and verified (single instance only) | `@nestjs/throttler`, in-memory | Shared store needed once more than one API instance runs | P3 |

### Profiles (the student-to-professional identity)
| Feature | Current status | Existing implementation | Missing work | Priority |
|---|---|---|---|---|
| Profile create/edit (name, headline, bio, location) | Complete and verified | `user_profiles`, `profiles.e2e-spec` | | |
| Visibility / privacy | Complete and verified | PUBLIC / MEMBERS / PRIVATE, enforced server-side | Visibility per section (for example hide education only) | P3 |
| Education history | **Partially implemented** | Derived only from institution memberships an institution admin created | Users cannot add their own education. No degree, field of study, grade or dates entered by the user. Only works for institutions that exist on EduHub and have an admin | P1 |
| Work experience | Not implemented | | Needs organizations that can be companies (see below) | P2 |
| Skills, projects, achievements, certifications | Not implemented | | New tables owned by the user | P2 |
| Profile photo / cover photo | Not implemented | `Avatar.jsx` shows initials only | File upload pipeline (storage, type/size checks, image resizing) | P2 |
| Contact information | Not implemented | Email is private by design | Optional contact fields with their own visibility | P3 |
| Resume / CV | Not implemented | | Upload pipeline, then a "generate from profile" option | P2 |
| Verification of education and employment | Partially implemented | A membership added by an institution admin **is** an attestation; public view shows only ACTIVE/LEFT memberships at published institutions | Self-reported vs verified flag; a request-verification flow | P2 |
| One continuous identity, school → career | **Supported by the core model** | One `users` row; memberships keep history (`left_at`) | Needs company organizations, self-reported entries and experience on top of it. No separate accounts are needed | — |

### Organizations and public pages
| Feature | Current status | Existing implementation | Missing work | Priority |
|---|---|---|---|---|
| School / college / university pages (public) | Implemented and verified (API); public page UI partial | `GET /institutions/:idOrSlug` works and is tested. Home page lists cards | No dedicated public institution detail page in the frontend router | P1 |
| Search and filter of institutions | Complete and verified | Category / country / state / city / search with trigram index, pagination | Public response leaks internal fields (§5 S4) | P0 (fields) |
| Create / edit organization | Implemented, staff only | PLATFORM_ADMIN creates | **Self-service registration or claim of a page by a school or company does not exist** | P2 |
| Duplicate prevention | Partially implemented | Live slug unique; `(source, external_id)` unique | No near-duplicate check (similar name + city) at creation | P2 |
| Verification and approval workflow | Partially implemented | Status machine DRAFT → PENDING_REVIEW → PUBLISHED, approvals queue, rejection reason in audit | Nobody outside staff can submit, so PENDING_REVIEW is never reached in real use. Publishing also sets `verified_at`, which merges "visible" with "verified" | P2 |
| Multiple administrators per organization | Complete and verified | INSTITUTION_ADMIN memberships, last-admin lock | | |
| Membership roles and permissions | Complete and verified | `TenantGuard` plus `tenant-isolation.e2e-spec` | Members are added **without their consent** (no invitation/accept step). PENDING/REJECTED statuses exist but no flow uses them | P1 |
| **Company pages** | **Not implemented** | `InstitutionCategory` has no COMPANY, and membership roles are education-only | Decide: extend `institutions` into a general `organizations` model, or add a sibling table. See §4 | P2 (design decision first) |
| Company–employee relationships | Not implemented | | Depends on the company decision | P2 |

### Jobs, social, communication
| Feature | Current status | Existing implementation | Missing work | Priority |
|---|---|---|---|---|
| Job posting, editing, publishing | Not implemented | Planned placeholder page only | Whole module | P2 |
| Job search and filters | Not implemented | | | P2 |
| Apply with profile or CV, applicant management, status tracking, recruiter permissions | Not implemented | `TenantGuard` / membership roles can be reused for recruiter permissions | | P2 |
| Posts (text/media), reactions, comments, sharing | Not implemented | | | P2 |
| Connections, follow/unfollow | Not implemented | | | P2 |
| Feed | Not implemented | | Simple reverse-chronological feed from follows/connections. No ranking engine | P2 |
| Notifications | Not implemented (email only) | `mail` module | In-app notification table plus unread count | P2 |
| Messaging | Not implemented | | | P3 |
| People search | Not implemented for users | Staff-only user search in admin | Public people search that respects visibility | P2 |

## 4. Database and migration assessment

**Strengths**
- Every foreign key has a deliberate delete rule (CASCADE for owned rows, SET NULL for "created by").
- Partial unique indexes give soft-delete-friendly uniqueness: email, slug, one active role per user per institution, member id per institution.
- CHECK constraints are the real last line of defence: lowercase email, slug format, coordinate ranges, token hash length, dates in order.
- `audit_logs` is append-only, enforced by a trigger, and has no foreign keys, so history survives deletes.
- UUIDv7 primary keys (time-ordered, which keeps indexes efficient).
- CI includes a migration-drift check. Migrations replay cleanly on an empty database (verified).
- Writes that need it run in transactions, including `FOR UPDATE` on the last-admin check. Unique-violation and serialization errors are turned into 409 responses.

**Gaps**
| # | Finding | Impact |
|---|---|---|
| D1 | **The two newest migrations (`phase2_profiles_and_email_tokens`, `admin_audit_log`) are untracked in git**, along with most Phase 2 code. Five docs are staged for deletion | A lost laptop or bad checkout loses the schema history. Any other environment cannot be migrated |
| D2 | `refresh_tokens` and `email_tokens` are never cleaned up | Both tables grow forever (about one row per login or refresh). Fine at 10k users, wasteful at 1M |
| D3 | Institution model is education-specific (`InstitutionCategory`, `MembershipRole`) | Companies cannot be represented without a design decision |
| D4 | Education is only memberships. No user-owned education, experience or skill tables | Blocks the core "continuous identity" product |
| D5 | No backup or restore strategy is documented or configured (Compose has a named volume only) | Data-loss risk as soon as there are real users |
| D6 | `institution.changeStatus` reads the current status outside the transaction that updates it | Two staff clicking at once could both pass the transition check. Low risk, easy fix |

**Company recommendation (decide before building P2):** generalize rather than duplicate. Add `COMPANY` (and later other non-education types) as an organization *kind* on the existing table, and add employment roles (EMPLOYEE, RECRUITER, ORG_ADMIN) next to the education roles. `TenantGuard`, memberships, the last-admin lock, the audit log and the approvals queue are then all reused unchanged. Renaming the table to `organizations` can be a separate, purely mechanical migration and is optional. The alternative, a separate `companies` table, would duplicate the guard, membership, approval and admin code paths, so it is not recommended.

## 5. Security findings (most serious first)

| # | Severity | Finding | Evidence | Fix |
|---|---|---|---|---|
| S1 | **High (operational)** | Most current work, including 2 migrations, is uncommitted, so CI has never run on it | `git status`: 77 changed paths; only the first 3 migrations are tracked | Commit on a branch and let CI run |
| S2 | Medium | **Refresh rotation race.** `rotate()` reads the token, checks `revokedAt`, issues a new one, then revokes the old one. Two concurrent requests with the same token can both pass and get two valid token families, which defeats reuse detection | `api/src/auth/token.service.ts` `rotate` (found by reading the code, not reproduced) | Make it atomic: `updateMany where {id, revokedAt: null}` and require `count === 1` inside one transaction; also set `replacedById` |
| S3 | Medium | Dependency vulnerabilities in runtime packages: API `prisma`/`zod` (high); browser bundle `axios` and `react-router` (high) | `npm audit --omit=dev` | Upgrade patch/minor versions. CRA's 3 critical issues are in the dev server only |
| S4 | Low–Medium | **Public institution API returns internal fields** to anonymous callers: `createdByUserId`, `deletedAt`, `source`, `sourceUpdatedAt`, `status` | Live call to `GET /api/v1/institutions?limit=1` | Use an explicit public `select` |
| S5 | Low–Medium | Institution admins can add any verified user as a member **without consent**. Membership then appears as education on that person's public profile | `memberships.service.ts` `create` | Invitation/accept step (statuses PENDING/REJECTED already exist) |
| S6 | Low | Login timing leaks whether an email exists (no hash check when the user is missing). Register returns 409 for a taken email | `auth.service.ts` `login`, `register` | Verify against a dummy hash. Treat register's 409 as an accepted trade-off |
| S7 | Low | Rate limiting is in-memory per process | `AppThrottlerGuard` | Shared store when scaling out |
| S8 | Low | `public/db-schema.html` (temporary) is reachable without login | Added this session | Delete when done, as planned |

**Checked and found sound:**
- IDOR and tenant isolation: the institution id from the URL is re-checked against an ACTIVE membership on every request, and the body can never choose the tenant. Covered by `tenant-isolation.e2e-spec`.
- SQL injection: Prisma throughout; raw SQL uses tagged templates with parameters.
- XSS: React escaping and no `dangerouslySetInnerHTML`.
- Token storage: access token in memory only, refresh token in an httpOnly, SameSite=Lax cookie scoped to the auth path.
- CSRF: only the refresh/logout endpoints use the cookie, and Lax plus CORS blocks reading the response.
- Input validation: whitelist and forbid unknown fields.
- Secrets: zod rejects a short or placeholder JWT secret in production; logs redact auth headers, cookies and passwords.
- Audit logging: inside the same transaction as the change.
- File uploads: none exist yet, so there is no attack surface. Uploads must be designed securely when added in P2.

## 6. Performance and scalability

At **10k users** the current design is fine as it is. Specific notes for growth:

| Item | Now | When it matters | Action |
|---|---|---|---|
| JWT check hits the DB on every request (user lookup by primary key) | OK | ~1M users / high request rate | Keep it (it is what allows instant suspension). Add a short cache only if it shows up in profiling |
| Offset pagination plus `count(*)` | OK for admin and directory lists | Feeds and large lists at 100k+ | Use cursor (keyset) pagination for the new feed, jobs and posts lists from the start |
| Institution search: ILIKE with trigram GIN on name/city | OK | Millions of rows, ranking needed | Postgres full-text search before any search engine |
| Prisma connection pool: default size, no PgBouncer | OK for one instance | Several API instances | Set `connection_limit`; add PgBouncer when running more than one instance |
| Token tables never pruned (D2) | OK | 100k+ users | Daily cleanup job |
| Audit log unbounded | OK | Tens of millions of rows | Partition by month, later |
| N+1 queries | None found: list endpoints use `include`/`select` (one extra query, not one per row) | | |

Kafka, microservices, Kubernetes, Elasticsearch and sharding are **not** justified by any current requirement. Postgres plus one API service will carry this product well past 100k users.

## 7. Broken or incomplete functionality

**Broken:** nothing found broken in what exists. All 268 e2e and 39 frontend tests pass.
**Fixed this session:** CORS rejected `127.0.0.1:3000`. Fixed in `api/.env` only; `.env.example` still lists only `localhost`.

**Incomplete:**
- Education is membership-only; users can't add their own.
- PENDING_REVIEW / PENDING / REJECTED statuses exist with no flow that produces them.
- No public institution detail page.
- No change-password and no self account deletion.
- `replaced_by_id` is never written.
- The README roadmap (phases 6–7 are school ERP and hostel management) contradicts the new LinkedIn-style direction.

## 8. Duplicate code and unnecessary complexity

- `isPlatformStaff()` is defined twice (`institutions.service.ts`, `profiles.service.ts`), and the same role check is inline in `TenantGuard`. Move it to `common/`.
- `UUID_RE` is defined twice (`tenant.guard.ts`, `institutions.service.ts`).
- `ClientInfo` interface is duplicated in `auth.service.ts` and `token.service.ts`.
- These are small; there is no structural duplication or over-abstraction. Dependencies are lean.
- `react-scripts` (Create React App) is deprecated and is the source of most of the frontend audit noise. Migrating to Vite is P3; it is not urgent.

## 9. Missing tests and verification gaps

- Only **1 unit spec**. Everything else is e2e. That is fine for an API this size, but add unit tests for logic-heavy pieces (status transitions, `EducationService` sorting and filtering).
- No test for **concurrent refresh** (S2) or concurrent institution status changes (D6).
- No test asserting the **public institution response shape** (would have caught S4).
- Frontend: 39 tests cover routing, access control and helpers. Profile and member-management pages have **no component tests**.
- Browser click-through, the Docker image build and CI have **not been verified** in this audit.
- No load test.

## 10. Prioritized roadmap

Each item lists: why it is needed · what can be reused · what is affected · dependencies · how to test it.

### P0: critical (integrity, security)
1. **Commit the current work on a branch and get CI green.** Why: uncommitted migrations and code can be lost, and CI has never run on them. Reuse: existing CI workflow. Affects: whole repo. Depends on: nothing. Test: the CI run (drift check, e2e, Docker build).
2. **Make refresh-token rotation atomic** (S2). Why: reuse detection can be bypassed. Reuse: `TokenService`. Affects: `auth/token.service.ts`. Test: new e2e that fires two parallel `/auth/refresh` calls with the same cookie and expects exactly one success.
3. **Explicit public `select` for institutions** (S4). Why: leaks internal ids and state. Reuse: `InstitutionsService`, keeping the full shape for staff. Affects: `institutions.service.ts`; check that `InstitutionCard` uses only public fields. Test: e2e asserting the exact anonymous response keys.
4. **Upgrade vulnerable runtime deps** (S3): prisma, zod (API); axios, react-router (frontend). Test: full test suites plus the frontend build.

### P1: finish what is partially built
5. **Membership invitation/consent** using the existing PENDING/REJECTED statuses. Affects: `memberships`, `profiles` (show pending invites), `MembersPanel`, `MyProfilePage`. Test: e2e covering invite → accept/decline, and that a pending invite is not shown publicly.
6. **Self-reported education entries** (new `education_entries` table owned by the user: institution FK *optional* plus free-text name, degree, field, dates). Show them alongside the existing membership-verified entries with a "verified" badge. Reuse: `EducationService`, `EducationList.jsx`. Depends on: nothing. Test: e2e for CRUD, ownership (no IDOR) and the public/visibility rules.
7. **Public institution detail page** in the frontend (API already exists). Test: component test plus manual check.
8. **Change password (signed in)** and the login timing fix (S6). Reuse: `PasswordService`, `tokenVersion`. Test: e2e.
9. Small cleanups: shared `isPlatformStaff`/`UUID_RE`, write `replaced_by_id`, make `changeStatus` transactional, add `127.0.0.1` to `.env.example`, update the README roadmap to the new direction, delete the temporary schema page.

### P2: core platform features (build in this order; each reuses the previous one)
10. **Organizations: add companies** (decision in §4) plus employment roles. Reuse: `institutions`, `TenantGuard`, memberships, approvals, audit.
11. **Self-service organization registration/claim** with near-duplicate detection and the existing approval queue (makes PENDING_REVIEW real). Separate "verified" from "published".
12. **Experience, skills, projects, certifications** on the profile (user-owned tables, same pattern as item 6).
13. **File uploads** (profile photo, cover, institution logo, CV): object storage, signed URLs, MIME and size checks, image re-encoding. Needed before CV-based applications.
14. **Jobs and applications**: job postings owned by an organization, recruiter role through membership roles, apply with profile/CV, application status pipeline, applicant list. Cursor pagination from day one.
15. **Follow and connections**, then a **simple reverse-chronological feed** of **posts** (text and images), reactions, comments.
16. **In-app notifications** (table plus unread count; email for important events through the existing `mail`).
17. **People search** that respects profile visibility.

### P3: growth
- Shared rate-limit store and PgBouncer when running more than one API instance.
- Token table cleanup job; audit log partitioning.
- Postgres full-text search for people, jobs and organizations.
- Messaging.
- Backups: scheduled `pg_dump` / managed point-in-time recovery, with a tested restore.
- Monitoring: error tracking and metrics.
- Vite migration.
- Load test at 100k users of synthetic data.

### Later
- Company CRM, school/college ERP (programmes, fees, attendance, hostel). The README's phases 6–7 belong here.

---

## Answers

1. **Already completed (verified by passing tests):**
   - Authentication with session security, email verification, password reset.
   - Platform staff roles, suspension and audit log.
   - Institution directory with search, admin CRUD and status workflow.
   - Multi-admin institution memberships with tenant isolation.
   - Basic profiles with visibility.
   - Super admin dashboard.
2. **Incomplete:**
   - Education is membership-only.
   - Organization approval exists, but no one outside staff can submit.
   - Membership has no consent step.
   - No public institution page, no change-password, no account deletion.
   - Companies, experience, skills, uploads, jobs, social, notifications and messaging are not started.
3. **Broken:** no functional breakage found. Issues to fix:
   - Refresh rotation race (S2).
   - Public field leak (S4).
   - Vulnerable runtime deps (S3).
   - Untracked migrations and code (D1/S1).
4. **Next:** P0 items 1–4, then P1 items 5–6. These are what make the student → professional identity real. After that, the company decision (item 10) unlocks everything else in P2.
5. **Single highest-priority task:** commit the current work, including both untracked migrations, to a branch and get CI passing. Everything else builds on code that does not yet exist in version control.
