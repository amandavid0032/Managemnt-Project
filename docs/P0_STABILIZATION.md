# P0 Stabilization: Report

**Date:** 2026-11-16 · **Branch:** `p0-stabilization` (from `main` @ `28a2663`) · **Not pushed.**
**Scope:** only the P0 items from [`EDUHUB_AUDIT_2026-11-16.md`](EDUHUB_AUDIT_2026-11-16.md). No feature work was done.

## Commits

| Commit | What |
|---|---|
| `ba97539` | Baseline: all previously uncommitted work, including the 2 untracked migrations |
| `386764b` | fix(auth): atomic refresh-token rotation |
| `fe079cf` | fix(institutions): public field allowlist |
| `71c2fad` | chore(deps): axios, react-router-dom |
| `5d2c8e1` | chore(deps): zod 4, deepmerge-ts override |

## 1. Files changed (after the baseline)

`api/src/auth/token.service.ts`, `api/src/institutions/institutions.service.ts`, `api/test/auth.e2e-spec.ts`, `api/test/institutions.e2e-spec.ts`, `api/package.json` + lock, `frontend/package.json` + lock. In total: 8 files, +330 / −90.

## 2. Database migrations

**None changed or added.** The baseline commit adds the two migrations that were untracked: `20261114131401_phase2_profiles_and_email_tokens` and `20261114145913_admin_audit_log`. Checks run:
- Migrations are in timestamp order.
- `prisma migrate diff --from-migrations … --to-schema-datamodel …` reports **"No difference detected"** (exit 0).
- `prisma migrate deploy` applies all 5 to an empty database, both on the host and from inside the API Docker image.

Baseline review: no `.env` files, keys or credentials are committed (`.env` and `.env.*` are ignored; only `.env.example` files are tracked). The only passwords found are test fixtures and the dev seed password. Also committed as part of the baseline: the 5 old docs that had already been staged for deletion (still recoverable from `28a2663`), `project-overview.html`, the audit report, and the temporary schema viewer.

## 3. Vulnerabilities addressed

| Area | Before | After |
|---|---|---|
| Refresh-token race (audit S2) | 1 token could become N live sessions | Exactly one winner |
| Public institution data (audit S4) | Creator user id plus internal fields public | Allowlist only |
| API runtime deps (`npm audit --omit=dev`) | 4 high | **0** |
| Frontend `axios` | high (31 advisories) | **0** |
| Frontend `react-router` | high (4 advisories) | moderate (2 advisories, fixed only in v7, see §10) |

## 4. Refresh-token race

**Reproduction:** a new e2e test sends 5 parallel `POST /auth/refresh` requests with the same cookie. On the old code **all 5 returned 200**, giving 5 live sessions from one token, none of which reuse detection knew about.

**Cause:** `rotate()` read the token, checked `revoked_at`, inserted a successor, and only then revoked the parent, with nothing atomic between those steps.

**Fix** (`token.service.ts`):
- The parent token is consumed with a conditional update (`UPDATE … WHERE id = $1 AND revoked_at IS NULL`) in the **same transaction** that inserts the successor.
- Postgres row locking makes concurrent callers queue on that row. Exactly one matches the condition; the rest match zero rows, get 401, and receive nothing.
- `replaced_by_id` is now recorded.

**Legitimate sessions:** two browser tabs share one cookie and can refresh at the same moment. With strict reuse detection the losing tab would revoke the whole family and sign the user out. A token that was rotated **less than 10 s ago** (`REUSE_GRACE_MS`) is therefore refused *without* revoking the family. Reuse after that window still revokes the family.

Trade-off: an attacker who replays within those 10 s gets nothing issued; they only fail to set off the alarm.

**Tests:**
- 5 simultaneous refreshes → exactly 1 success, 1 live token, and the winner can still refresh.
- The successor link (`replaced_by_id`) is written.
- A replay within the window → 401 and the family survives.
- A replay after the window → family revoked.

The old "replay immediately revokes the family" test was replaced by the after-window version: the same assertion, with the rotation aged past the window instead of sleeping. The race test passed 5 runs in a row.

## 5. Public API exposure

- **Endpoints checked:** `GET /institutions` and `GET /institutions/:idOrSlug` (both `@Public`).
- **Other places that return institution data were already narrow:** `/auth/me` returns id/slug/name; education on public profiles returns a curated subset.
- **Fix:** non-staff callers, anonymous or signed in, now receive `PUBLIC_INSTITUTION_SELECT`, an **allowlist**: identity, contact, address, coordinates, `verifiedAt` and media. Removed: `createdByUserId`, `status`, `source`, `sourceUpdatedAt`, `deletedAt`, `createdAt`, `updatedAt`.
- **Staff:** PLATFORM_ADMIN and SUPER_ADMIN still get the full record, which the admin screens use. The public UI uses only fields that are still public.
- **Tests:** exact key set for anonymous and signed-in users on both endpoints; the creator id is absent anywhere in the response body; media is still returned; staff still get the full record.
- The existing `?status=DRAFT` breach test checked the now-hidden `status` field. It now asserts that the draft is absent and that the filter is ignored.
- Confirmed against the live dev API.

## 6. Dependency versions

| Package | Before | After | Notes |
|---|---|---|---|
| axios (frontend) | 1.6.8 | **1.21.1** | Same major version |
| react-router-dom / react-router | 6.30.1 | **6.30.6** | Latest v6. Not moved to v7 |
| zod (API) | 3.25.76 | **4.6.7** | Major version. Used only in `env.schema.ts`; no source change needed. The same 12 env scenarios give identical accept/reject results and parsed values; only zod's built-in error wording differs |
| prisma / @prisma/client | 6.19.3 | 6.19.3 | Last 6.x release. The advisory is fixed only in Prisma 7.10.1 (major migration), so not upgraded |
| deepmerge-ts (via @prisma/config) | 7.1.5 | **8.0.2** | Through `overrides`. Verified: `prisma validate` / `generate` / `migrate status` / drift check / `migrate deploy` (also inside the image) |

## 7. Tests

| Suite | Baseline | Now |
|---|---|---|
| API typecheck | pass | pass |
| API lint | pass | pass |
| API unit | 2 / 2 | 2 / 2 |
| API e2e (Postgres) | 268 / 268 | **277 / 277** (+4 auth, −1 replaced, +6 institutions) |
| Frontend tests | 39 / 39 | 39 / 39 |
| Failures | — | **none** |

## 8. Build and Docker

- **API `nest build`:** OK; the built `dist/main.js` boots and `/health` returns 200.
- **Frontend production build:** OK. Bundle is +10.9 kB gzip because of the newer axios.
- **API Docker image:** builds. `migrate deploy` inside the container applies all 5 migrations to an empty DB, and the container passes its health check.
- **`docker compose config`:** valid.
- **Frontend Docker image:** **not built, and not part of CI.** `frontend/` has no `.dockerignore` (764 MB `node_modules` sent as build context), and its Dockerfile runs the dev server (`npm start`). It is a pre-existing problem and is outside P0.

## 9. CI

- **GitHub Actions has not run.** The branch is not pushed: pushing needs your approval, and the `gh` CLI is not installed.
- Every step of the `api` job was repeated locally: `migrate deploy` on a fresh DB, drift check, typecheck, lint, unit, e2e, build. The Docker job equivalent was also run (§8). The frontend job (tests and build) was run too.
- **Browser smoke test:** not possible because the Chrome extension is not connected. An HTTP smoke test passed against the restarted dev servers: pages return 200, CORS works for `127.0.0.1:3000`, the public API has no internal fields, and refresh without a cookie returns 401.

## 10. Remaining risks

1. **CI has never run on this code.** Push the branch and open a PR to get a real CI result.
2. **react-router v6:** 2 moderate advisories are fixed only in v7.
   - SSR `deserializeErrors`: not applicable, because this app has no SSR.
   - Backslash open redirect via `<Link>` / `useNavigate` with untrusted paths: every dynamic navigation was reviewed, and all targets are app-built or come from `location.state`, never from URL input.
   - Still, a v7 migration should be planned.
3. **Prisma 6** depends on the `deepmerge-ts` override. Remove the override when moving to Prisma ≥ 7.10.1.
4. **Multi-tab refresh on the frontend:** the server now keeps the session alive, but the tab that loses the race still clears its in-memory token and shows as signed out until it reloads. A one-retry fix in `axiosClient.js` would close this gap. Not done, to keep P0 focused.
5. **Dev-only advisories remain:** API dev deps (18, including `@faker-js/faker`) and the frontend `react-scripts` toolchain. None ship to production; the fix is the Vite migration (P3).
6. **Frontend Dockerfile / `.dockerignore`** (see §8).
7. **Temporary schema viewer** (`/admin/db-schema`, `public/db-schema.html`) is still present and must be deleted before any deployment.
