# EduHub — Project Status

**Last updated:** 2026-10-12
**Phase:** 1 (foundation) — complete and verified
**Next:** Phase 2

---

## ⚠️ Read this first: nothing is committed yet

All of Phase 1 lives in the working tree only. The last commit is still
`de8dcd1 logo`, from before this work started.

```
2189 deletions staged   (node_modules + the old backend/)
  10 modified files
  10 untracked items    (api/, docs/, .github/, .gitignore, docker-compose.yml …)
```

**Commit before starting Phase 2.** If this working tree is lost, the entire
phase is lost with it.

---

## What the project is now

```
Managemnt-Project/
├── api/            NestJS + TypeScript + PostgreSQL   ← the backend
├── frontend/       React 19 + CRA + Tailwind
├── docs/           all project documentation
├── docker-compose.yml
├── .github/workflows/ci.yml
└── README.md
```

| Layer | Technology |
|---|---|
| Backend | NestJS 11, TypeScript (strict), Prisma 6 |
| Database | **PostgreSQL 16.15** — `eduhub_dev` on `localhost:5432` |
| Frontend | React 19, Create React App, Tailwind 3 |
| Auth | JWT access token + persisted refresh token (Argon2id hashing) |
| Logging | Pino (structured JSON) |

The old Express + MongoDB backend has been **deleted**. MongoDB is no longer
used anywhere. It remains in git history at commit `dbb1f18` if ever needed.

---

## Phase 0 — security fixes (done)

| Problem | Fixed |
|---|---|
| Database password committed to a public repo | Untracked, removed from disk, `.gitignore` added |
| `node_modules` committed (2,153 files) | Untracked — tracked files went 2,210 → 56 |
| Write endpoints open to the internet, no auth | Old backend removed; new API requires auth on every write |
| Server started before the database connected | Fixed |
| Internal errors leaked to clients | One error handler, safe messages only |
| A "migration" that **dropped the database** on import | Deleted |

> The old MongoDB password is still visible in git history (commits `dbb1f18`,
> `5d0c94e`, `a873f55`) — you chose to leave history intact. The cluster is
> deleted, but treat that password as compromised anywhere it was reused.

---

## Phase 1 — what was built (done)

### Database — 6 tables, 3 migrations

```
users ──────────────┬─< refresh_tokens
                    └─< institution_memberships >── institutions ──┬─< institution_external_ids
                                                                   └─< institution_media
```

With 9 CHECK constraints, 4 partial unique indexes, and 2 trigram search indexes.

Key decisions:
- **No `rating` column.** Ratings must come from real reviews (Phase 5). The old
  system generated a random 3.0–5.0 score and showed it as stars.
- **`institutions.email` is optional and not unique** — treating it as an identity
  blocks bulk import, since real datasets often have no email.
- **`institution_memberships`** is the multi-tenancy core: one EduHub account can
  belong to many institutions over time, with different roles.

### API — 14 endpoints

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register`, `/login`, `/refresh`, `/logout`, `GET /auth/me` |
| Institutions | `GET /institutions`, `GET /institutions/:idOrSlug`, `POST`, `PATCH /:id`, `DELETE /:id` |
| Memberships | `GET`, `GET /:membershipId`, `POST` (all tenant-scoped) |
| Health | `GET /health` |

Base URL `/api/v1`. Discovery supports pagination, search, category/country/city
filters and sorting. Category input is case-insensitive.

### Security

- Auth is **on by default** — routes must opt out with `@Public()`
- Roles are assigned server-side; `{"role":"super_admin"}` in a request returns **400**
- Refresh tokens are stored hashed, rotate on use, and replay revokes the whole family
- Cross-tenant access returns **404, not 403**, so tenant existence is not leaked
- Rate limiting on auth routes

### Frontend

Homepage shows institutions by category, loaded from the API, with working
search and real pagination. Duplicate components were merged into one
`InstitutionCard` and one `InstitutionsSection`.

---

## Verified (actually run, not assumed)

| Check | Result |
|---|---|
| API typecheck / lint / build | clean |
| E2E tests | **85 / 85 passing** (4 suites) |
| Frontend build | compiled successfully |
| Migrations | 3 applied, no drift |
| Browser render | 6 cards + 6 images, no errors |

Test suites: `auth`, `institutions`, `tenant-isolation`, `throttling`.
The tenant-isolation suite is the important one — each failing test there
would be a data breach.

---

## Not verified

| Item | Why |
|---|---|
| **Docker** | The Docker daemon is not running on this machine. `Dockerfile` and `docker-compose.yml` are written but have never been executed. |
| **CI pipeline** | `.github/workflows/ci.yml` is written but has never run — it needs a push. Each of its commands was verified locally. |

---

## How to run it

```bash
# Postgres must be running
brew services start postgresql@16

# API  → http://localhost:4000
cd api && npm run start:dev

# Frontend → http://localhost:3000
cd frontend && npm start
```

Demo logins (development only), password `DevPassword123`:

| Email | Role |
|---|---|
| `platform.admin@eduhub.test` | Platform admin |
| `alice.admin@eduhub.test` | Admin of Northgate |
| `bob.admin@eduhub.test` | Admin of Riverside |
| `carla.student@eduhub.test` | Student at Northgate |

There is no login screen yet, so these work through the API only.

---

## Next step — Phase 2

Suggested order:

1. **Commit Phase 1** — nothing is saved yet.
2. **Verify Docker and CI** — start Docker Desktop, run `docker compose up --build`, then push so CI runs.
3. **Build the auth UI** — login and register screens. The API is ready; the
   frontend has no sign-in page, which is why the Profile button was removed.
4. **Email verification and password reset** — accounts are currently created
   `ACTIVE` because no email can be sent yet.
5. **Institution detail page** — `GET /institutions/:idOrSlug` already exists and
   is currently unused by the frontend.

Later phases: search and compare (3), external data import (4), reviews and
real ratings (5), institution management (6), hostel module (7).

---

## Open decisions

- **Teachers / Students sections** were deleted from the homepage because they
  showed invented content for modules that do not exist. Restore them as
  placeholders, or leave them out until those modules are real?
- **Git history** still contains the old database password. Leave it, or rewrite
  history later?
