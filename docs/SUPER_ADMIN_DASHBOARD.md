# EduHub — Super Admin Dashboard

Status: implemented and tested on 2026-11-14. Browser click-through has **not** been done by the implementer (the browser extension was not connected). See §10.

## 1. What existed before (audit)

| Area | Found | Reused? |
|---|---|---|
| `/admin` layout | Top-tab layout with 3 sections | Replaced by a sidebar layout. Same routes, same `RoleRoute` guard |
| Overview | 8 tiles: institution counts via `?limit=1`, `GET /users/stats` | Replaced by `GET /admin/overview`. `/users/stats` is kept for compatibility |
| Institutions | List, create, edit, status lifecycle, archive (soft delete), members panel | Kept. Added columns, filters and a review dialog |
| Users | List with search, role and status filters; suspend and reactivate | Kept. Added filters, a detail page and role management |
| Lifecycle | `DRAFT → PENDING_REVIEW → PUBLISHED ⇄ SUSPENDED`, archive via DELETE, `verifiedAt` set on first publish | Kept unchanged. Approval and rejection are mapped onto it (§3) |
| Guards | `@PlatformRoles` (class-level), `TenantGuard` with platform-staff override, `JwtStrategy` re-reads role and status from the DB on every request | Reused for every new route |
| Audit trail | None | Built (§2) |
| Platform-role changes | Deliberately impossible through the API | Added for `PLATFORM_ADMIN` only (§4) |
| Users' country | Not stored (only free-text `profile.location`) | Reported as unavailable. Nothing was invented |
| Uploads and documents | No object storage | "Submitted documents" is listed as a gap |

No differences were found between the repo and the documented stack: NestJS 11, Prisma 6, PostgreSQL 16, React 19, Tailwind 3 and CRA.

## 2. Database change

Migration `20261114145913_admin_audit_log` is additive only. It creates one table, `audit_logs`:

- **Columns:**
  - `actor_user_id` and `actor_role`; the role is stored as it was at the time of the action.
  - `action`, `target_type`, `target_id` and `institution_id`.
  - `ip_address` and `user_agent`.
  - `metadata` (jsonb) and `created_at`.
- **No foreign keys.** History has to outlive the rows it describes, and `ON DELETE SET NULL` would itself rewrite history.
- **Append-only.** A `BEFORE UPDATE OR DELETE` trigger raises an exception. An e2e test proves that UPDATE, DELETE and raw `DELETE FROM` are all refused.
- **Written in the same transaction as the change.** A refused or failed action leaves no row; tests cover this.

Recorded actions:

- `institution.created`, `institution.updated` (field-level from/to), `institution.status_changed` (plus `decision` and `reason`) and `institution.archived`
- `user.status_changed` and `user.platform_role_changed`
- `membership.created`, `membership.updated` and `membership.status_changed`. These carry `actingAs`: the member's role, or `PLATFORM_OVERRIDE`.

The log starts with this release. Earlier changes were never recorded, and the UI says so.

## 3. Review workflow, mapped onto the existing statuses

No new status values were added, so no existing record or test changes meaning.

| Requested | Implemented as |
|---|---|
| DRAFT | `DRAFT` |
| PENDING_REVIEW | `PENDING_REVIEW` |
| APPROVED | `PENDING_REVIEW → PUBLISHED`. `verifiedAt` is set the first time; the audit entry records `decision: APPROVED` |
| REJECTED | `PENDING_REVIEW → DRAFT` **with a required `reason`** (400 without one). The audit entry records `decision: REJECTED` |
| SUSPENDED | `SUSPENDED`; an optional reason is recorded |

The reviewer, review date and reason come from the audit log. They appear on the Approvals page and on each institution's publication history.

## 4. New API endpoints

| Method | Path | Who |
|---|---|---|
| GET | `/api/v1/admin/overview` | Platform Admin, Super Admin |
| GET | `/api/v1/admin/analytics/registrations?granularity=day\|week\|month\|year&from&to` | Platform Admin, Super Admin |
| GET | `/api/v1/admin/analytics/distribution` | Platform Admin, Super Admin |
| GET | `/api/v1/admin/activity` | Platform Admin, Super Admin |
| GET | `/api/v1/admin/approvals` | Platform Admin, Super Admin |
| GET | `/api/v1/admin/system/health` | Platform Admin, Super Admin |
| GET | `/api/v1/admin/settings` | **Super Admin only**. Secrets are reported as `set` / `not set` |
| GET | `/api/v1/admin/audit-logs` (filters: action, targetType, targetId, actorUserId, institutionId, from, to) | Platform Admin, Super Admin |
| PATCH | `/api/v1/users/:id/platform-role` `{platformRole: USER\|PLATFORM_ADMIN}` | **Super Admin only** |

Changes to existing endpoints:

- `PATCH /institutions/:id/status` accepts an optional `reason`, which is required when rejecting.
- `GET /institutions` accepts `verified=true|false`, which only staff can use.
- `GET /users` accepts `emailVerified=true|false` and `membershipRole=STUDENT|TEACHER|STAFF|INSTITUTION_ADMIN`.

### Notes on the figures

- **Trends:** only Total users and Total institutions show a trend. It compares new rows in the last 30 days with the 30 days before, using `created_at`. Status-based figures have no history, so they show no trend.
- **Registration series:** buckets are UTC and zero-filled. They count records created in each period, including ones archived since.
- **Active students and teachers:** distinct people with an ACTIVE membership in that role, not yet ended, at a live institution. The `membershipRole` list filter uses the same definition, and a test checks that the card and the list agree.

## 5. Permission matrix (enforced by the API)

| Capability | User | Platform Admin | Super Admin |
|---|---|---|---|
| Dashboard, analytics, health, audit log | — | ✓ | ✓ |
| Create, edit, publish, suspend, archive institutions; approve or reject | — | ✓ | ✓ |
| Suspend or reactivate accounts | — | ✓ (not super admins) | ✓ |
| Manage any institution's members (override) | — | ✓ | ✓ |
| Grant or revoke Platform Admin | — | — | ✓ |
| View settings | — | — | ✓ |
| Create, demote or remove a Super Admin | — | — | Database only (`npm run create:superadmin`) |

Self-lockout rules:

- Nobody can change their own status or role.
- Nobody can change a Super Admin's role through the API, so the last Super Admin cannot be removed.
- A role change bumps `tokenVersion` and revokes refresh tokens, so it takes effect immediately.

Institution roles (STUDENT, TEACHER, STAFF, INSTITUTION_ADMIN) remain separate and tenant-scoped.

## 6. Frontend

**Layout:** a navy sidebar, collapsible on desktop and a drawer on mobile, with the three groups from the spec. A top bar holds breadcrumbs, global search (users and institutions) and the account menu.

**Built screens:**

- Dashboard
- Institutions: new columns, plus country and verification filters
- Institution detail: verification facts, member counts, publication history and admin activity
- Users & Accounts: membership-role and email-verified filters
- User detail: memberships, changes to the account, actions taken by the person, suspend/reactivate and role changes
- Roles & Permissions
- Countries & Regions: real coverage and a plan
- Verification & Approvals
- Analytics & Reports: date range and CSV export
- Audit Logs: filters and a CSV export of the current page
- Platform Settings: read-only
- System Health

**Planned screens:** Academic Structure, Content Moderation, Admissions & Jobs and Notifications. Each opens a page that says "Not built yet" and lists what has to exist first. These pages have no buttons and show no sample data.

**No notifications bell.** There is no notification store, so a bell would always be empty or fake.

**Charts** are dependency-free SVG, each with an accessible "show as table" view.

**Every status change goes through one dialog** (`StatusChangeDialog`). It requires a reason to reject, and it shows the server's error instead of closing.

## 7. Tests

| Suite | Result |
|---|---|
| API e2e (9 suites) | **268 / 268**: the original 227 plus 41 in `test/super-admin.e2e-spec.ts` |
| API unit | 2 / 2 |
| Frontend (5 suites) | **39 / 39**: the original 24 plus 15 in `src/__tests__/superAdmin.test.js` |
| API typecheck and lint, frontend `CI=true` build | Pass |

Changes to existing tests were limited to setup, and no assertions were changed or removed:

- `resetDatabase` also truncates `audit_logs`.
- The service-level RACE test now passes an actor argument.

**Flakiness, not explained.** Early on, 2 runs failed: one full-suite run had 2 failures, and two runs of the new suite had 1–2 different failures each (a register 400 caused by too-short fixture names, which was then fixed, plus a 404 and a 401 that were never explained). Since then there have been 8 consecutive clean full runs and 10 consecutive clean runs of the new suite. The cause was not identified. Treat this as open.

## 8. Remaining gaps

- **Not seen in a browser.** The pages were not clicked through and there are no screenshots, because the extension was not connected (§10).
- Submitted documents for verification need file storage.
- Users by country is not available because accounts do not record a country.
- "Active users" metrics would need activity tracking; only `lastLoginAt` exists.
- Error monitoring: only an in-process 5xx counter that resets on restart. Sentry or similar is not integrated.
- There are no request-performance metrics and no background jobs.
- Countries, regions and academic structure need new tables. The plan is shown in the UI.
- Content moderation, admissions, jobs and notifications are planned only, because the content models do not exist.
- Admin editing of a user's account details (for example their name) was deliberately not added. Changing someone's identity on their behalf needs a product decision.
- Branding and localisation settings are not configurable.

## 9. Run

```bash
cd api && npx prisma migrate deploy && npm run build && node dist/main.js   # :4000
cd frontend && npm start                                                     # :3000
```

Open **http://localhost:3000** (not 127.0.0.1, because of CORS and the cookie) and sign in as `super.admin@eduhub.test` / `DevPassword123`.

## 10. Browser checklist (to be done by a person)

1. `/admin`: 8 cards show real numbers, and each card opens a filtered list.
2. Collapse the sidebar, reload: it stays collapsed. Narrow the window: a hamburger opens the drawer.
3. Institutions: filter by country and by verification; open a record and look at the history panels.
4. Move a record to "Submit for review" → Approvals → Reject with no reason (the button stays disabled) → enter a reason → Reject. Check that the reason appears in Decision history and in Audit Logs.
5. Approve a submission and check that the record shows "Verified".
6. Users: filter by "Active student", open an account, suspend it and reactivate it.
7. Roles: grant Platform Admin to a verified user, then revoke it.
8. Sign in as `platform.admin@eduhub.test`: Platform Settings is not in the menu, and Roles shows no Grant controls.
9. Analytics: switch the granularity, set a date range and export a CSV.
10. System Health: "Check again" refreshes the timestamps.
