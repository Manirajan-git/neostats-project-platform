# NeoStats — Collaborative Project Management Platform

Multi-user collaborative project management platform built for the NeoStats Full Stack
Engineering Hackathon. Users with different roles manage projects, tasks, team members,
comments and notifications, with relevant changes pushed to connected users in real time.

> **Status:** Phase 1 (foundation) and Phase 2 (authentication, authorization, user
> management) are complete. Projects, tasks, comments, activity logs, notifications,
> Socket.IO real-time sync and the full dashboard are intentionally deferred to later
> phases — see [Roadmap](#roadmap).

## Technology stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 |
| Backend | Express 4 (TypeScript), Socket.IO planned for a later phase |
| Database | PostgreSQL 18 with Prisma 6 (migrations) |
| Auth | httpOnly cookie + short-lived signed JWT (HS256), Argon2id password hashing |
| Validation | Zod |
| Tests | Vitest + Supertest (real PostgreSQL integration tests) |
| Tooling | npm workspaces monorepo, concurrently |

## Repository structure

```
.
├── package.json                # npm workspaces root (dev/build/typecheck/test/db scripts)
├── README.md                   # this file
├── ARCHITECTURE.md             # architecture note (auth flow, schema, migrations, tests)
├── apps/
│   ├── api/                    # Express API server
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/     # init + add_authentication_fields
│   │   │   └── seed.ts         # idempotent development accounts
│   │   ├── src/
│   │   │   ├── app.ts          # express app factory (middleware + routes)
│   │   │   ├── index.ts        # process bootstrap (listen + graceful shutdown)
│   │   │   ├── config/env.ts   # env loading + startup validation
│   │   │   ├── lib/prisma.ts
│   │   │   ├── middleware/     # authenticate, authorize, validate, errorHandler, trustedOrigin
│   │   │   ├── routes/         # auth, users, health
│   │   │   ├── schemas/        # zod schemas
│   │   │   ├── services/       # auth.service, user.service
│   │   │   ├── types/          # SafeUser DTO, express augmentation
│   │   │   └── utils/          # errors, asyncHandler, userMapper
│   │   ├── tests/              # vitest integration tests (25 tests)
│   │   └── .env / .env.example
│   └── web/                    # Next.js frontend
│       └── src/
│           ├── app/            # / (health), /login, /dashboard
│           ├── components/     # health panel
│           └── lib/            # api client (credentials: include), types
```

## Prerequisites

- Node.js 22+, npm 10+
- PostgreSQL 14+ (this project was developed against 18.6)
- Git

## PostgreSQL setup

1. Create a database (once):

   ```sql
   CREATE DATABASE "Neostats";
   ```

   The database name is case-sensitive — this project uses `Neostats`.

2. Point `DATABASE_URL` at it (see below).

## Environment variables

Copy the example files and fill in real values. **Never commit `.env` / `.env.local`**
(both are git-ignored).

```bash
# API (apps/api/.env)
cp apps/api/.env.example apps/api/.env

# Web (apps/web/.env.local) - already present in most checkouts
cp apps/web/.env.example apps/web/.env.local
```

| Variable | App | Required | Description |
|---|---|---|---|
| `DATABASE_URL` | api | yes | PostgreSQL connection string |
| `PORT` | api | no (4000) | API port |
| `CORS_ORIGIN` | api | no (`http://localhost:3000`) | Trusted browser origins (comma separated) — used for credentialed CORS and the CSRF origin check |
| `JWT_SECRET` | api | prod: yes | Signing secret, min 32 chars in production. Dev falls back to an ephemeral secret with a warning |
| `JWT_EXPIRES_IN` | api | no (`8h`) | Auth cookie / token lifetime |
| `AUTH_COOKIE_NAME` | api | no (`neostats_token`) | Auth cookie name |
| `SEED_*_EMAIL` / `SEED_*_PASSWORD` | api | no | Override development seed credentials (see [Seed](#seed)) |
| `NEXT_PUBLIC_API_URL` | web | yes | API base URL, e.g. `http://localhost:4000` |

## Install dependencies

```bash
npm install
```

## Database migrations

```bash
npm run db:migrate      # prisma migrate dev (create + apply)
npx prisma migrate status -w apps/api   # verify status
npm run db:generate     # regenerate Prisma client only
```

Migrations are additive and reversible-by-convention: the initial `init` migration is
never rewritten; new features ship new migration folders.

## Seed

```bash
npm run db:seed
```

Creates one development account per system role **if the email does not exist yet**
(idempotent — re-running never duplicates users and never overwrites existing
passwords). Passwords are Argon2id-hashed. Credentials can be overridden with the
`SEED_*` environment variables documented in `apps/api/.env.example`.

## Running the application

```bash
npm run dev          # both apps (concurrently)
npm run dev:api      # API only  → http://localhost:4000
npm run dev:web      # web only  → http://localhost:3000
```

Open <http://localhost:3000/login>, sign in with a seed account, then use the
`/dashboard` page. The Phase 1 system-status page remains at `/`.

## API reference (Phase 2)

All responses are JSON. Errors use a single shape:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "…", "details": [{ "path": "email", "message": "…" }] } }
```

### Authentication

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/login` | public | Body `{ email, password }` → 200 + httpOnly cookie. Returns `{ user }` (never `passwordHash`). Wrong credentials → 401 `INVALID_CREDENTIALS` (identical message whether the email exists or not); deactivated account with correct password → 403 `ACCOUNT_DISABLED` |
| POST | `/api/auth/logout` | cookie optional | Clears the auth cookie → `{ success: true }` |
| GET | `/api/auth/me` | required | Current active user → `{ user }`; 401 if missing/invalid/expired token or deactivated account |

### User management (ADMIN only)

| Method | Path | Description |
|---|---|---|
| GET | `/api/users` | Paginated list: `?page=1&limit=20&q=search` (limit max 100). Returns `{ data: SafeUser[], meta: { page, limit, total, totalPages } }` |
| GET | `/api/users/:id` | Single user; 404 `USER_NOT_FOUND`, 400 for malformed ids |
| POST | `/api/users` | Create `{ name, email, password, role }` → 201. Password is Argon2id-hashed; duplicate email → 409 `DUPLICATE_EMAIL`; invalid role/fields → 400 |
| PATCH | `/api/users/:id` | Allowlisted fields only: `name`, `email`, `role`, `password`. Unknown fields (e.g. `passwordHash`, `isActive`) → 400. Demoting the last active admin → 409 `LAST_ADMIN` |
| PATCH | `/api/users/:id/deactivate` | Soft-deactivation (never deletes). Self-deactivation → 400 `CANNOT_DEACTIVATE_SELF`; last active admin → 409 `LAST_ADMIN`; already inactive → 409 |

Other routes: `GET /api/health` (public; database connectivity probe).

### System roles

| Role | Meaning (Phase 2 scope) |
|---|---|
| `ADMIN` | Full user management, all endpoints below `/api/users` |
| `PROJECT_MANAGER` | Project-level manager in later phases; no user-management access |
| `TEAM_MEMBER` | Ordinary member; no user-management access |
| `VIEWER` | Read-only member in later phases; no user-management access |

Global system roles are intentionally kept separate from future project-level
membership roles.

## Development demo accounts

> ⚠️ **Development only.** These defaults are bundled for local demos. They are not
> secrets for production — override them via `SEED_*` env vars and **never deploy with
> them unchanged.**

| Role | Email | Password |
|---|---|---|
| Administrator | `admin@neostats.dev` | `Admin@12345!` |
| Project Manager | `manager@neostats.dev` | `Manager@12345!` |
| Team Member | `member@neostats.dev` | `Member@12345!` |
| Viewer | `viewer@neostats.dev` | `Viewer@12345!` |

## Tests

```bash
npm test                  # vitest integration suite (apps/api)
npm run typecheck         # tsc for api (src + tests) and web
npm run lint -w apps/web  # eslint
```

The suite runs against the real PostgreSQL database using uniquely-named fixtures
(`itest-*@example.com`) that are deleted afterwards. It never resets or drops the
database.

## Build

```bash
npm run build             # api (tsc) + web (next build)
```

## Security notes

- Passwords: Argon2id (memory 64 MiB, t=3, p=4 defaults of `node-argon2`).
- Sessions: signed JWT (HS256, `8h`) in an `httpOnly`, `SameSite=Lax`, `Secure`-in-production
  cookie; no tokens in `localStorage`/`sessionStorage`. Payload contains only the subject id.
- Every protected request re-reads the user from the database, so **deactivated accounts
  lose access immediately even with a previously issued token** (JWTs are not revocable —
  short expiry + per-request active check is the mitigation).
- Authorization is enforced server-side only (`authenticate` + `authorizeRoles`); the UI
  never decides permissions. Unauthenticated → 401, unauthorized → 403.
- CORS uses an explicit origin allowlist with `credentials: true` (never `*`).
- CSRF: state-changing requests from browsers must present a trusted `Origin`/`Referer`
  (403 `ORIGIN_NOT_ALLOWED` otherwise), combined with `SameSite=Lax` cookies.
- Validation: strict Zod schemas (unknown keys rejected), centralised error handler;
  no stack traces, SQL, Prisma internals or credentials are ever returned.
- User enumeration: login returns an identical generic error for unknown email and
  wrong password; the inactive-account message appears only after the password verifies.
- Secrets live only in git-ignored `.env` files; `.env.example` contains placeholders.
- `x-powered-by` disabled; JSON body limited to 100 kB.

## Known limitations

- No password-reset flow exists yet (admin can set a password via `PATCH /api/users/:id`).
- Logout clears the cookie but cannot revoke a JWT that is already issued elsewhere;
  expiry (8 h) and the per-request active check bound the risk.
- No rate limiting / lockout on login yet.
- The login and dashboard pages are protected client-side (UX guard only); the API is
  the real security boundary.
- `npm audit` reports pre-existing high-severity advisories in the Phase 1 tree
  (`eslint-config-next` transitive `braces`/`micromatch`/`fast-glob`, and `prisma` dev
  tooling `deepmerge-ts`). None were introduced by Phase 2; the suggested fixes are
  major-version downgrades, so they were not applied blindly.
- `psql` is not on the system PATH in this environment (full path used by maintainers).

## Roadmap

**Completed — Phase 1:** npm-workspaces monorepo, Next.js 16 + Express + Prisma +
PostgreSQL foundation, health endpoint with live database check, additive migration
workflow, `.env` configuration, Git repository.

**Completed — Phase 2:** extended `User` model (`passwordHash`, `role`, `isActive`),
additive migration, login/logout/me with httpOnly JWT cookie, Argon2id hashing,
server-side role authorization, Admin-only user management APIs (list/detail/create/
update/deactivate) with pagination and search, idempotent seed with four role accounts,
functional `/login` and `/dashboard` pages, 25 automated integration tests, README +
architecture documentation.

**Deferred:** projects, project memberships and project-level roles, tasks and comments,
task versioning with HTTP 409 conflict handling, activity logs, notifications, Socket.IO
real-time collaboration, remaining required pages (`/projects`, `/users`, `/profile`, …),
and the polished product UI.
