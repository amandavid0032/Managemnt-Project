# Phase 2 — Profiles, Education History, School Dashboards, Email

**Status:** built and tested; verified against a live server over HTTP; **not yet clicked through in a browser**
**Date:** 2026-11-14
**Builds on:** [`PHASE1_LOGIN_AND_ADMIN.md`](PHASE1_LOGIN_AND_ADMIN.md). Nothing from Phase 1 was rebuilt.

---

## 1. Audit before building (what existed)

Run in this session, not copied from earlier notes:

| Check | Result |
|---|---|
| API typecheck / lint | pass |
| API e2e | **116 / 116** (5 suites) |
| Migrations vs `eduhub_dev` | 3 applied, no drift |
| Frontend production build (`CI=true`) | pass |
| Docker Compose | **not verifiable** — Docker daemon not running on this machine (file validated with `docker compose config`) |
| GitHub Actions | **not verifiable** — `gh` CLI not installed and the work is not pushed |
| Browser | **not verifiable** — Chrome extension "not connected" (same as Phase 1) |

Reused rather than rebuilt: `TenantGuard` + `@TenantScoped`/`@Tenant`, memberships and their partial unique indexes, `tokenVersion` session kill, `/auth/me` memberships, the UI kit (`Badge`, `Field`, `ConfirmDialog`, `Pagination`, `TableStates`), `apiError`, `AuthContext`, `RoleRoute`.

---

## 2. Decisions, including where the brief was challenged

| # | Brief said | Done instead | Why |
|---|---|---|---|
| 1 | Profile photo upload "only if secure storage exists" | **No photo.** Initials avatar | No object storage exists. Accepting arbitrary image URLs instead would let a profile embed a tracking pixel for every viewer. |
| 2 | "Find existing registered users" | **Exact-email lookup only**, admin-only, 20/min | A fuzzy search lets any school admin page through every account and harvest names and emails. |
| 3 | Add existing users to an institution | **Only accounts with a verified email** can be added | Otherwise someone registers a student's address first, waits to be enrolled, and walks into that school's data. |
| 4 | Email verification | Verification does **not** gate login | Gating would lock out every existing account and change Phase 1 auth. Verification is required where it protects something (decision 3). |
| 5 | Education history | **Derived from memberships**, no new table | Every membership is created by the institution, so every entry is attested. Ending a membership sets `LEFT` + `left_at` and never deletes. |
| 6 | Profile visibility | **PRIVATE by default**; `MEMBERS`, `PUBLIC` opt-in; refusals are 404 | Exposure is opted into. 404 makes "private" and "doesn't exist" indistinguishable. Email is never on a profile. |
| 7 | "INSTITUTION_ADMIN can manage their own institution" | They manage **members**. Editing the institution's public listing stays with platform staff | Publication is moderated (DRAFT → review → PUBLISHED). Letting tenants edit a published record would bypass review. **Product decision needed.** |
| 8 | Change membership roles safely | An institution must keep **≥ 1 active admin**, enforced with a row lock (`SELECT … FOR UPDATE`) | Without the lock two admins demoting each other at once both succeed. A test reproduces this: without the lock the institution ends with **0** admins. |
| 9 | Reset / verification tokens | Token travels in the URL **fragment** (`#token=`), stripped from the address bar on load | Fragments are never sent to servers or in `Referer`. |
| 10 | Email provider | `console` (dev) · `memory` (tests) · `smtp` (prod) | SMTP covers every transactional vendor. Production refuses to boot unless `MAIL_PROVIDER=smtp`; `console` would put live reset links in logs. |
| 11 | Registration UI was not in the brief | Added `/register` | Without it nobody can sign up through the web, and email verification has nothing to verify. |

---

## 3. Database (one migration, additive only)

`api/prisma/migrations/20261114131401_phase2_profiles_and_email_tokens`

| Change | Detail |
|---|---|
| `user_profiles` (new) | 1:1 with `users`, PK `user_id`, `headline` ≤160, `bio` ≤2000, `location` ≤120, `visibility` (default `PRIVATE`). No row = empty private profile, so no backfill. CHECKs reject blank strings. |
| `email_tokens` (new) | `purpose` (`EMAIL_VERIFICATION` / `PASSWORD_RESET`), SHA-256 `token_hash` (unique, CHECK length 64), `email` the token was sent to (CHECK lowercase), `expires_at` (CHECK > `created_at`), `consumed_at`, `request_ip`. |
| `institution_memberships.created_by_user_id` (new, nullable) | Who attested the membership. `ON DELETE SET NULL`. Null for pre-Phase-2 rows. |
| Enums | `ProfileVisibility`, `EmailTokenPurpose` |

No existing column was changed or dropped; no data was migrated.

```bash
cd api
npm run prisma:deploy            # apply (any environment)
npm run prisma:status            # confirm
```

---

## 4. API changes

New endpoints:

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/auth/password/forgot` | public, 5/min | Same response for any address. Max 3 emails per account per 15 min, silently. |
| POST | `/auth/password/reset` | public, 10/min | Consumes token; new Argon2id hash; bumps `tokenVersion`; revokes all refresh tokens; kills other reset links; clears this browser's cookie; emails a "password changed" notice. Also marks the address verified. |
| POST | `/auth/email/verify` | public, 10/min | Token must match the address the account has **now**. Lifts `PENDING_VERIFICATION`, never un-suspends. |
| POST | `/auth/email/resend` | signed in, 3/min | 400 if already verified; 429 after 3 per 15 min. |
| GET | `/profiles/me` | signed in | `{ user, profile, education }` — owner view incl. member IDs. |
| PATCH | `/profiles/me` | signed in | `fullName`, `headline`, `bio`, `location`. `null`/blank clears. No visibility, email, role. |
| PATCH | `/profiles/me/visibility` | signed in | `PUBLIC` · `MEMBERS` · `PRIVATE` |
| GET | `/profiles/:userId` | public (optional auth) | Respects visibility; 404 for every refusal; never email or member IDs. |
| GET | `/institutions/:id/overview` | tenant `INSTITUTION_ADMIN`, `STAFF` | Institution details, real member counts by role/status, viewer's role and `canManage`. |
| GET | `/institutions/:id/memberships/lookup?email=` | tenant `INSTITUTION_ADMIN`, 20/min | Exact address only. Shows only memberships at **this** institution. |
| PATCH | `/institutions/:id/memberships/:mid` | tenant `INSTITUTION_ADMIN` | Correct `role` / `institutionMemberId`. |
| PATCH | `/institutions/:id/memberships/:mid/status` | tenant `INSTITUTION_ADMIN` | `ACTIVE` · `SUSPENDED` · `LEFT` (final, kept as history). |

Changed, backward compatible:

| Endpoint | Change |
|---|---|
| `POST /auth/register` | Also sends a verification email. |
| `GET /auth/me`, `POST /auth/login` | `user` now includes `emailVerifiedAt`. |
| `GET /institutions/:id/memberships` | Optional filters `role`, `status`, `search`; rows include `userId`, `updatedAt`, `createdBy`. |
| `POST /institutions/:id/memberships` | **Refuses unverified or inactive accounts (400).** Records `createdByUserId`. Race on duplicates → 409, not 500. Returns the same row shape as the list. |

Platform staff keep their explicit cross-tenant override for all tenant routes (Phase 1 behaviour), which is how the super-admin panel manages members.

---

## 5. Frontend

| Route | Who | What |
|---|---|---|
| `/register` | anyone | Sign-up with live password rules |
| `/forgot-password` | anyone | Request link; identical confirmation for any address |
| `/reset-password#token=` | anyone with the link | New password + confirm; signs out everywhere |
| `/verify-email#token=` | anyone with the link | Verifies; works signed in or out |
| `/profile` | signed in | View/edit profile, visibility, education history, account; verify-email banner with resend |
| `/u/:userId` | per visibility | Public profile; "this is how others see you" for the owner |
| `/school` | signed in | Picker when someone has dashboards at several institutions |
| `/school/:slug` | admin/staff of that school | Overview, real counts, institution profile, your membership, members panel |

- After login: platform staff → `/admin`; one school (admin/staff) → `/school/:slug`; several → `/school`; everyone else → `/profile`.
- The members panel is **one component** used by both the school dashboard and the super-admin institution screen (the old read-only panel was removed). Add-member is two-step: find by exact email, see who it is, then add.
- No new UI libraries. No fake numbers: every count is a database count.

---

## 6. Test results (actual runs)

| Suite | Result |
|---|---|
| API e2e | **227 passed / 227**, 8 suites (116 from Phase 1 + 111 new) |
| API unit | **2 / 2** (SMTP provider against an in-test SMTP server) |
| Frontend | **24 / 24**, 4 suites (routing guards, landing, school access, members panel, token hook, password rules) |
| API typecheck · lint · build | pass |
| Frontend production build (`CI=true`) | pass |
| Migration drift (`prisma migrate diff --exit-code`) | no difference |

New e2e suites: `email-flows` (28), `profiles` (34), `school-dashboard` (49).

**Mutation checks** — each protection was deliberately broken to confirm a test fails:

| Broken on purpose | Tests that caught it |
|---|---|
| Removed single-use check on email tokens | 4 failed |
| Removed the admin row lock | RACE test failed: institution left with **0** admins |

One existing test changed **setup only**: in `tenant-isolation.e2e-spec.ts` the "outsider" now verifies their email through the real link, because unverified accounts can no longer be enrolled. No assertion was changed or removed.

**Live server smoke test (HTTP, real database, console email)** — all passed: super-admin login, session restore, create → publish → public → archive, self-suspend blocked, student → `/users` 403, logout kills refresh, school overview counts, staff `canManage:false`, student and other-school admin 404, public profile without email, education history with past entry, register → unverified add refused → verify via emailed link → add succeeds → reset via emailed link → link reuse refused → old password 401 → new password 200. Test rows created by the smoke run were removed afterwards.

---

## 7. Security review

| Area | Finding / control |
|---|---|
| Role escalation | No endpoint sets `platformRole`. Profile and membership DTOs reject unknown fields (`forbidNonWhitelisted`). Making someone `INSTITUTION_ADMIN` leaves `platformRole = USER` (tested). |
| Tenant isolation | All new tenant routes go through `TenantGuard`; ids from the route, re-verified per request; cross-tenant attempts are 404 (tested for overview, lookup, update, status). |
| Impersonation | Unverified accounts cannot be enrolled (tested). |
| Enumeration | Forgot-password is uniform and sends mail in the background; per-account cap is silent; private profile ≡ missing profile; lookup is exact-match, admin-only, throttled. *Residual:* an institution admin can still learn whether an exact address is registered — inherent to adding people by email. |
| Tokens | 32 random bytes; SHA-256 at rest; single use via conditional UPDATE; expiry 30 min (reset) / 24 h (verify); newer token kills older; purpose-bound; bound to the address it was sent to; redacted from logs (`req.body.token`). |
| Sessions | Reset revokes all access (tokenVersion) and refresh tokens in one transaction (tested). |
| Email content | User-supplied names HTML-escaped (tested). SMTP refuses cleartext in production (tested). |
| SQL injection | All queries through Prisma; the one raw query uses tagged-template parameters. |
| Dependencies | `npm audit fix` cleared `body-parser` and `multer` advisories. **Remaining:** `zod < 4.6.6` (fix needs zod 4 — breaking, used by the env schema) and `deepmerge-ts` (only via Prisma CLI config, build-time). |

---

## 8. Environment variables (new)

| Variable | Default | Notes |
|---|---|---|
| `APP_URL` | `http://localhost:3000` | Base of links in emails |
| `MAIL_PROVIDER` | `console` | `console` dev · `memory` test only · `smtp` **required in production** |
| `MAIL_FROM` | `EduHub <no-reply@eduhub.local>` | Sender |
| `SMTP_HOST` | — | Required when `smtp` |
| `SMTP_PORT` | `587` | |
| `SMTP_SECURE` | `false` | `true` for 465 |
| `SMTP_USER` / `SMTP_PASSWORD` | — | Secrets: deployment secret store only |

---

## 9. Running it

```bash
cd api && npm run prisma:deploy && npm run db:seed   # once
cd api && npm run start:dev                          # → :4000  (emails print to this log)
cd frontend && npm start                             # → :3000
```

Demo accounts (password `DevPassword123`, development only): `super.admin@`, `platform.admin@`, `alice.admin@` (Northgate admin), `bob.admin@` (Riverside admin), `sara.staff@` (Northgate staff), `dan.teacher@`, `carla.student@` — all `@eduhub.test`. Carla's profile is PUBLIC and has a past (LEFT) membership.

### Manual browser checklist (still to do)

1. Sign in as `alice.admin@eduhub.test` → lands on `/school/northgate-secondary-school`.
2. Counts show 1 student, 1 teacher, 1 staff, 1 administrator.
3. **Add member** → enter a new account's email → refused until verified.
4. Register a new account at `/register`; copy the verify link from the **API terminal**; open it → verified; add it as Student → Students becomes 2.
5. **Change role**, **Suspend**, **Reinstate**, **End** a member — ended row stays, greyed, no actions.
6. Try to end Alice's own membership → refused ("only active administrator").
7. Sign in as `sara.staff@` → same dashboard, no management buttons.
8. Sign in as `dan.teacher@` → open `/school/northgate-secondary-school` → "No dashboard here".
9. `/profile` as Carla → edit headline, change visibility to Private → `/u/<carla id>` signed out shows "not available".
10. `/forgot-password` → link from API log → new password → every tab signed out.
11. Repeat the Phase 1 checklist in `PHASE1_LOGIN_AND_ADMIN.md` §5.5.

---

## 10. Known limitations

| # | Limitation |
|---|---|
| 1 | **Not clicked through in a browser.** All of it compiles, is unit/e2e tested, and passed a live HTTP smoke test. |
| 2 | Docker Compose and GitHub Actions still **never run successfully** (no daemon; not pushed). |
| 3 | No profile photo (needs object storage). |
| 4 | No email-address change flow; email is fixed at registration. |
| 5 | No in-app "change password" (with current password) — reset by email is the route. |
| 6 | School admins cannot edit their institution's public details (see decision 7). |
| 7 | No join-request flow: `PENDING` / `REJECTED` statuses exist but nothing creates them. |
| 8 | Role change is an in-place correction; a genuine student→teacher transition should be "end + add" to keep both in history. |
| 9 | No audit log of who suspended/ended whom (only `created_by_user_id`). |
| 10 | Teachers and students have no dashboard of their own — nothing for one to show until Notices/Attendance exist. |
| 11 | `zod` advisory open (major upgrade). |
| 12 | Email is sent in-process without a retry queue; a provider outage loses that email (the user can request another). |

---

## 11. Recommended Phase 3

1. **Run the browser checklist** above and Phase 1's, then push and get one green CI run and one `docker compose up`.
2. **Audit log** — append-only table written by membership changes, institution status changes and user suspension. Cheap now, painful to backfill.
3. **Notices** — the first two-sided feature (admin/staff publish → members read); gives teachers and students a reason to have a dashboard.
4. **Institution self-editing with review** — tenant admins propose changes; published records change only after platform approval.
5. **Email change + in-app password change**, both with re-verification.
6. **Object storage (S3-compatible)** → profile photos and institution media uploads.
7. **zod 4 upgrade** to close the advisory.
8. **Vite migration** (CRA is deprecated) as an isolated task.
