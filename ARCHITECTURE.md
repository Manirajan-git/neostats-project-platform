# NeoStats — Architecture Note

Companion to [README.md](./README.md). Covers the decisions behind Phase 1 + Phase 2.
Future phases (projects, tasks, real-time) will be appended here when implemented.

## 1. Frontend / backend separation

- `apps/web` (Next.js 16, port 3000) and `apps/api` (Express 4, port 4000) are
  **separate processes** in one npm-workspaces monorepo, started together with
  `npm run dev` (concurrently).
- The browser talks to the API at `NEXT_PUBLIC_API_URL` (default
  `http://localhost:4000`) with `fetch(..., { credentials: "include" })`. There is no
  proxy: the cookie is scoped to the API origin, and CORS on the API explicitly allows
  the web origin (`CORS_ORIGIN`) with `credentials: true` (never `*`).
- The Next.js server never talks to the database and never reads the session cookie —
  the session cookie is httpOnly on the API origin, unreadable from JavaScript *and*
  from the Next.js process. All data access goes through the Express API (Prisma).
- Client auth state is derived from `GET /api/auth/me` (the single source of truth),
  held in React state only — no tokens in `localStorage`/`sessionStorage`.
- Route protection on `/dashboard` is a **UX guard** (redirect to `/login` on 401).
  It is not a security boundary; every API request is independently authorized.

## 2. Authentication flow

1. `POST /api/auth/login` — Zod validates `{ email, password }`, email is
   normalized (trim + lowercase), user is looked up.
2. Password verified with **Argon2id** (`node-argon2`). A dummy hash verification runs
   when the email does not exist so response timing does not reveal account existence.
3. Wrong password / unknown email → identical `401 INVALID_CREDENTIALS` message.
   Correct password on a deactivated account → `403 ACCOUNT_DISABLED` (reveals nothing
   to callers who don't already know the password).
4. Server signs a JWT: payload `{ sub: userId }` only (no personal data), HS256,
   `JWT_EXPIRES_IN` (default 8 h), and sets cookie `neostats_token` with
   `httpOnly`, `sameSite=lax`, `path=/`, `maxAge` matching the token, `secure` in
   production.
5. `GET /api/auth/me` and every protected route run the `authenticate` middleware:
   verify signature/expiry → load user by id → **require `isActive`** → attach the safe
   user profile to `req.user`.
6. `POST /api/auth/logout` re-sets the cookie with `Expires` in the past using the
   same attributes, so browsers delete it.

### Why a JWT cookie and not a server session table?

The hackathon scope has no session-management requirements, JWT verification is
stateless, and `jsonwebtoken` is a mature, well-understood library on this stack.
A signed JWT is not revocable, so the design bounds that risk deliberately:

- short lifetime (8 h), **and**
- every request re-loads the user from PostgreSQL, so **deactivation takes effect
  immediately** for existing tokens (proven by an automated test).

If later phases require global "sign out everywhere", migrating to server-side
sessions is a contained change (swap `authenticate` internals, keep the route contract).

## 3. CSRF strategy

Cookie auth makes CSRF a real concern, addressed in layers (none claimed as a
universal fix on its own):

1. `SameSite=Lax` — cross-site form POSTs do not carry the cookie in modern browsers.
2. **Origin check middleware** (`trustedOrigin`) — every state-changing request from a
   browser must present an `Origin`/`Referer` inside the `CORS_ORIGIN` allowlist,
   otherwise `403 ORIGIN_NOT_ALLOWED`. Requests without either header (curl, tests,
   native clients) are allowed because they cannot be sent as a cross-site browser
   attack carrying ambient cookies.
3. Credentialed CORS with an explicit allowlist (no `*`), so a foreign origin can
   neither read responses nor pass the origin check.

## 4. Authorization model

- `authenticate` (401 on missing/invalid/expired token or inactive account) →
  `authorizeRoles("ADMIN")` (403 when the role is insufficient). Authentication and
  authorization failures are deliberately distinct status codes.
- Role checks exist only on the server; the frontend merely hides UI it knows will be
  rejected. The global `SystemRole` enum (`ADMIN`, `PROJECT_MANAGER`, `TEAM_MEMBER`,
  `VIEWER`) is on `User`; future project-membership roles will live on a separate
  `ProjectMember` table so global and project-level permissions never blur.
- Destructive invariants are enforced in the service layer, not just schemas:
  self-deactivation is blocked and the last active administrator cannot be demoted or
  deactivated.

## 5. User schema changes

```prisma
model User {
  id           String     @id @default(cuid())
  email        String     @unique          // normalized to lowercase
  name         String
  passwordHash String                       // Argon2id; never serialized
  role         SystemRole @default(TEAM_MEMBER)  // least privilege
  isActive     Boolean    @default(true)    // soft deactivation, never row deletion
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt
}
```

API responses are built from an explicit `SAFE_USER_SELECT` projection plus a
`toSafeUser` mapper, so `passwordHash` cannot leak through accidental spreading.

## 6. Migration strategy

- The initial `20261010054424_init` migration is immutable history.
- Phase 2 shipped `20261010063208_add_authentication_fields`, created with
  `prisma migrate dev --create-only`, **reviewed and hand-edited before applying**:
  Prisma's generated SQL added `passwordHash TEXT NOT NULL`, which fails on a non-empty
  table. The applied version adds the column nullable → backfills existing rows with an
  empty sentinel that can never verify against any password → enforces `NOT NULL` →
  adds `role` (default `TEAM_MEMBER`) and `isActive` (default `true`). No user is given
  a working credential or admin rights by the migration; credentials are established
  only through the admin API or the seed.
- `prisma migrate reset` / `db push` are never used. Verification:
  `npx prisma migrate status` → "Database schema is up to date".

## 7. Validation and error handling

- Zod schemas per route (`schemas/`), applied by `validate(schema, source)` middleware
  for body, query and params. Object schemas are `.strict()` — unknown fields
  (e.g. `passwordHash`, `isActive` sent by clients) are rejected with 400 instead of
  silently stripped.
- One central Express error handler produces a single JSON shape:
  `{ error: { code, message, details? } }`.
  Mapped: `AppError` → its status; `ZodError` → 400; Prisma `P2002` → 409, `P2025` → 404;
  malformed JSON → 400; anything else → generic 500 with the stack logged **server-side
  only**. Raw database errors are no longer echoed by `/api/health` (the failure is
  logged, the response stays `{ database: { status: "down" } }`).
- Pagination is validated with a maximum `limit` of 100; list responses return explicit
  `meta` (page/limit/total/totalPages).

## 8. Testing approach

- **Vitest + Supertest** against the **real PostgreSQL database** (no mocks): the app is
  instantiated through `createApp()` (no socket binding), so tests exercise the same
  middleware chain as production.
- Isolation without resets: fixtures use unique `itest-*@example.com` emails, are
  tracked per test file, and deleted in `afterAll`. Test files run sequentially
  (`fileParallelism: false`) to avoid cross-file interference. The development database
  is never reset or dropped.
- Coverage: 25 tests across `auth.test.ts` (login success/failure/generic messages,
  inactive account, missing/invalid/expired tokens, cookie flags, logout clearing,
  hash non-disclosure), `authorization.test.ts` (401/403 per role, deactivated-token
  rejection, privilege-escalation attempts) and `users.test.ts` (full admin CRUD,
  duplicates, validation, pagination limits, deactivation rules, last-admin guard,
  seed idempotency + password-stability).
- Unit vs integration: everything above is integration-level (HTTP + database). No
  purely mocked unit tests exist yet.
