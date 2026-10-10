# NeoStats — Collaborative Project Management Platform

Multi-user collaborative project management platform built for the NeoStats Full Stack
Engineering Hackathon. Users with different roles manage projects, tasks, team members,
comments and notifications, with relevant changes pushed to connected users in real time.

> **Status:** Phase 1 (foundation), Phase 2 (authentication/RBAC) and Phase 3 (full
> product: projects, tasks, Kanban, team management, activity history, notifications,
> user management UI, profile) are complete. Remaining: Socket.IO push sync and
> password-reset flow — see [Roadmap](#roadmap).

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
│   │   │   ├── schema.prisma   # User, Project, ProjectMember, Task, Comment, ActivityLog, Notification
│   │   │   ├── migrations/     # init + auth fields + project/task domain
│   │   │   ├── seed.ts         # idempotent development accounts
│   │   │   └── seed-demo.ts    # idempotent "Demo:" projects/tasks (opt-in)
│   │   ├── src/
│   │   │   ├── app.ts          # express app factory (middleware + routes)
│   │   │   ├── index.ts        # process bootstrap (listen + graceful shutdown)
│   │   │   ├── config/env.ts   # env loading + startup validation
│   │   │   ├── lib/            # prisma, permissions (project access), journal (activity+notifications)
│   │   │   ├── middleware/     # authenticate, authorize, validate, errorHandler, trustedOrigin
│   │   │   ├── routes/         # auth, users, projects, tasks, notifications, dashboard, activity, health
│   │   │   ├── schemas/        # zod schemas
│   │   │   ├── services/       # auth, user, project, task, activity, notification, dashboard
│   │   │   ├── types/          # SafeUser DTO, express augmentation
│   │   │   └── utils/          # errors, asyncHandler, userMapper
│   │   ├── tests/              # vitest integration tests (76 tests, 10 files)
│   │   └── .env / .env.example
│   └── web/                    # Next.js frontend
│       └── src/
│           ├── app/            # / (health), /login, (app)/ dashboard, projects/[id]/*, tasks/[id], users, notifications, profile
│           ├── components/     # ui kit, toast, shell (sidebar/header/session), project tabs
│           └── lib/            # api client (credentials: include), domain types, formatters
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
npm run db:seed          # four development role accounts (idempotent)
npm run db:seed:demo     # optional "Demo:" projects, tasks, comments, notifications
```

`db:seed` creates one development account per system role **if the email does not
exist yet** (idempotent — re-running never duplicates users and never overwrites
existing passwords). Passwords are Argon2id-hashed. Credentials can be overridden
with the `SEED_*` environment variables documented in `apps/api/.env.example`.

`db:seed:demo` adds clearly-labelled sample content — project names start with
`Demo:` — so every screen has realistic data: four projects (Active / On hold /
Completed), 16 tasks across all statuses with due dates (including overdue ones),
members with different project roles, comments, activity rows and unread
notifications. It is fully idempotent (existing demo projects are skipped), never
modifies real records, and the demo projects can be deleted from the UI at any time.

## Running the application

```bash
npm run dev          # both apps (concurrently)
npm run dev:api      # API only  → http://localhost:4000
npm run dev:web      # web only  → http://localhost:3000
```

Open <http://localhost:3000/login>, sign in with a seed account, then explore:
`/dashboard`, `/projects` (Kanban board, team and activity under `/projects/[id]`),
`/tasks/[id]`, `/notifications`, `/users` (administrators) and `/profile`. The
Phase 1 system-status page remains at `/`.

## API reference (Phase 3)

All responses are JSON. Errors use a single shape:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "…", "details": [{ "path": "email", "message": "…" }] } }
```

Task updates additionally carry a `meta` payload on conflicts (see
[Optimistic concurrency](#optimistic-concurrency-task-updates)).

### Authentication

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/login` | public | Body `{ email, password }` → 200 + httpOnly cookie. Returns `{ user }` (never `passwordHash`). Wrong credentials → 401 `INVALID_CREDENTIALS` (identical message whether the email exists or not); deactivated account with correct password → 403 `ACCOUNT_DISABLED` |
| POST | `/api/auth/logout` | cookie optional | Clears the auth cookie → `{ success: true }` |
| GET | `/api/auth/me` | required | Current active user → `{ user }`; 401 if missing/invalid/expired token or deactivated account |
| PATCH | `/api/auth/profile` | required | Body `{ name }` only (length-validated) → `{ user }`. Email/role changes are admin-only via `/api/users` |

### User management

`/api/users` (except `directory`) is **ADMIN only**.

| Method | Path | Description |
|---|---|---|
| GET | `/api/users` | Paginated list: `?page=1&limit=20&q=search` (limit max 100). Returns `{ data: SafeUser[], meta }` |
| GET | `/api/users/:id` | Single user; 404 `USER_NOT_FOUND`, 400 for malformed ids |
| GET | `/api/users/directory` | Lightweight `{ id, name, email, role }` picker list for ADMIN + PROJECT_MANAGER (used by project/member pickers) |
| POST | `/api/users` | Create `{ name, email, password, role }` → 201. Argon2id-hashed; duplicate email → 409 `DUPLICATE_EMAIL` |
| PATCH | `/api/users/:id` | Allowlisted fields only: `name`, `email`, `role`, `password`. Unknown fields → 400. Demoting the last active admin → 409 `LAST_ADMIN` |
| PATCH | `/api/users/:id/deactivate` | Soft-deactivation (never deletes). Self-deactivation → 400 `CANNOT_DEACTIVATE_SELF`; last active admin → 409 `LAST_ADMIN` |
| PATCH | `/api/users/:id/activate` | Re-activates a deactivated account |

### Projects

| Method | Path | Description |
|---|---|---|
| GET | `/api/projects` | Paginated, filtered: `?page&limit&q&status` → `{ data: ProjectSummary[], meta }`. Only projects the caller can access |
| POST | `/api/projects` | **ADMIN only.** `{ name, description?, managerId? }` → 201. The manager (or admin) owns day-to-day control |
| GET | `/api/projects/:id` | `ProjectDetail` incl. `taskCounts`, `myRole` and `permissions { canManage, canChangeStatus, canComment }` |
| PATCH | `/api/projects/:id` | `name`, `description`, `status` (managers); `managerId` reassignment is ADMIN only |
| GET | `/api/projects/:id/members` | Member list with project roles and `isOwner` |
| POST | `/api/projects/:id/members` | `{ userId, role }` (managers) — user must exist and be active |
| PATCH | `/api/projects/:id/members/:memberId` | `{ role }` (managers) |
| DELETE | `/api/projects/:id/members/:memberId` | Remove member (managers cannot remove the project owner) |
| GET | `/api/projects/:id/tasks` | Paginated tasks: `?page&limit&status&priority&assigneeId&q`; response includes `permissions` for the board |
| POST | `/api/projects/:id/tasks` | Create (managers only). Assignee must be a project member/owner, else 400 `INVALID_ASSIGNEE` |
| GET | `/api/projects/:id/activity` | Paginated activity history for the project |

### Tasks

| Method | Path | Description |
|---|---|---|
| GET | `/api/tasks/:id` | Task detail incl. project, `permissions`, comments |
| PATCH | `/api/tasks/:id` | **Requires `version`** (optimistic lock). Managers may edit all fields; project members with status rights may send only `status`. Stale version → 409 `TASK_VERSION_CONFLICT` with `meta.task` = current server state |
| DELETE | `/api/tasks/:id` | Managers only |
| POST | `/api/tasks/:id/comments` | `{ content }` (non-viewers) → 201 |
| DELETE | `/api/tasks/:id/comments/:commentId` | Own comment, or any comment for managers |

### Notifications

| Method | Path | Description |
|---|---|---|
| GET | `/api/notifications` | `?page&limit&unreadOnly` → `{ data, meta, unreadCount }` |
| GET | `/api/notifications/unread-count` | Badge counter |
| PATCH | `/api/notifications/:id/read` | Mark one read |
| POST | `/api/notifications/read-all` | Mark everything read → `{ updated }` |

### Dashboard & activity

| Method | Path | Description |
|---|---|---|
| GET | `/api/dashboard` | Aggregates for the caller: project counts by status, task counts by status, my overdue/due-soon tasks, next 14 days of deadlines, recent activity, unread notifications |
| GET | `/api/activity` | Platform-wide activity feed (members see their own projects; administrators see everything) |

Other routes: `GET /api/health` (public; database connectivity probe).

### Permission model

Global system role × project membership role decide everything; non-members get
**404** (project existence is never leaked), members with insufficient rights get
**403**.

| Capability | ADMIN | PROJECT_MANAGER (owner) | PROJECT_MANAGER (non-owner) | TEAM_MEMBER (MEMBER) | VIEWER / project VIEWER |
|---|---|---|---|---|---|
| Create projects | ✔ | — | — | — | — |
| Edit project / archive, manage members | ✔ | ✔ | — | — | — |
| Reassign project manager | ✔ | — | — | — | — |
| Create / edit / delete tasks | ✔ | ✔ | — | — | — |
| Move task between columns | ✔ | ✔ | ✔ | ✔ | — |
| Comment | ✔ | ✔ | ✔ | ✔ | — |
| View project, tasks, activity | ✔ | ✔ | ✔ | ✔ | ✔ |

### Optimistic concurrency (task updates)

Every `Task` carries a `version` counter. `PATCH /api/tasks/:id` requires the
client's expected `version`; the write runs as an atomic
`UPDATE … WHERE id = ? AND version = ?`. When someone else changed the task
first, zero rows match and the API responds `409 TASK_VERSION_CONFLICT` with
`error.meta.task` holding the current server state — the UI shows a conflict
banner with a one-click "Load latest version". A stale title/status edit can
therefore never silently overwrite a colleague's work.

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
npm test                  # vitest integration suite (apps/api) — 76 tests
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

- Notifications are **polled** (badge every 60 s, pages on load) — Socket.IO push
  sync is still deferred, so a second user's changes appear when a page refreshes
  or the next poll runs. Optimistic-concurrency 409s do surface immediately on the
  write that conflicts.
- The Kanban board moves cards with explicit ◀/▶ controls (permission-aware), not
  drag-and-drop; boards fetch the first 100 tasks per project.
- UI flows were verified by API smoke tests, `next build` and type-checking; this
  environment has no browser automation, so in-browser click-through was not
  scripted.
- No password-reset flow exists yet (admin can set a password via `PATCH /api/users/:id`).
- Logout clears the cookie but cannot revoke a JWT that is already issued elsewhere;
  expiry (8 h) and the per-request active check bound the risk.
- No rate limiting / lockout on login yet.
- The app pages are protected client-side (UX guard only); the API is the real
  security boundary.
- `npm audit` reports pre-existing high-severity advisories in the Phase 1 tree
  (`eslint-config-next` transitive `braces`/`micromatch`/`fast-glob`, and `prisma` dev
  tooling `deepmerge-ts`). None were introduced by later phases; the suggested fixes are
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

**Completed — Phase 3:** domain schema (`Project`, `ProjectMember`, `Task`, `Comment`,
`ActivityLog`, `Notification` + enums) with a purely additive migration; project CRUD
with ownership/membership management; tasks with priorities, assignees, due dates,
comments and **optimistic concurrency (HTTP 409 + `meta.task`)**; activity journal and
notifications written in the same transaction as the change that caused them; dashboard
aggregates API; full app shell (sidebar, header, breadcrumbs, unread badge) and all
required pages — dashboard, projects list, project overview/board/team/activity, task
detail with comments and conflict handling, users admin, notifications, profile — with
76 automated integration tests and optional `Demo:` seed data.

**Remaining / deferred:** Socket.IO real-time push (notifications currently poll),
password-reset flow, login rate limiting, drag-and-drop Kanban.
