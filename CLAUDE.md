# one-way-notification

A notification service: external systems register, link their users, and send
notifications (email / SMS / Telegram) with per-channel delivery tracking.
One-way — this project sends notifications outward; it does not handle
inbound replies.

## Monorepo layout

Bun workspaces, not Turborepo/Nx.

- `apps/server` — the API, built on Effect. Owns the Postgres schema
  (`apps/server/db/migrations/`).
- `apps/web` — Next.js app. Not yet wired to the API.
- `packages/schema` (`@repo/schema`) — the single source of truth for
  domain records, domain errors, and the `HttpApi` contract (endpoints,
  groups). Shared between server and, eventually, web. API definitions live
  here, never inline in the server — see effect-smol's own guidance: API
  schemas must stay separate from the server implementation so they can be
  shared without leaking server code into clients.

Root `package.json` scripts (`dev:server`, `dev:web`, `migrate`) use
`bun --cwd=apps/<x> run <script>`, not `bun run --filter <x>` — `--filter`
wraps output in a box that adds no value here and was deliberately dropped.

## Stack rules

- **Bun only.** `Bun.serve`, `Bun.sql`/`Bun.SQL` for one-off scripts (e.g.
  migration runner), `Bun.Glob`, `Bun.file`. Never Express, never
  `node:fs` when a Bun equivalent exists. `bun add`/`bun install`, never
  npm/pnpm/yarn.
- **Effect 4.0 (beta), not 3.x.** This is a real, consequential distinction —
  the API surface changed significantly between major versions (`Context.Tag`
  → `Context.Service`, `Effect.fork` → `Effect.forkChild`, SQL modules moved
  into `effect/unstable/sql/*`, etc.). Do not trust memorized Effect 3.x
  patterns or docs; verify against the installed version.
  - **`effect-smol/` at the repo root is a full clone of the Effect source
    for the exact installed version.** Its `LLMS.md`, `AGENTS.md`,
    `MIGRATION.md`, and `ai-docs/` are the canonical reference — read them,
    or grep the actual `.ts` source under `effect-smol/packages/`, before
    assuming an API shape. Don't guess from training data; this version is
    new enough that guesses are frequently wrong.
  - SQL access goes through `effect/unstable/sql/SqlClient`, backed by
    `@effect/sql-pg`'s `PgClient.layer(...)` (which registers both the
    `PgClient` and generic `SqlClient` tags — depend on the generic
    `SqlClient` in repo code, not `PgClient`, unless you need a
    Postgres-specific feature).
  - Package versions across the Effect ecosystem must match. `effect` and
    `@effect/*` packages here are pinned to `4.0.0-beta.102` — when adding a
    new `@effect/*` package, install the version matching that exact beta
    (check its `beta` dist-tag on npm), not `latest` (which targets Effect
    3.x and will silently break type inference via stale `Context.Tag`
    usage).

## Domain layering (per feature, e.g. `users`, `notifications`)

Each domain under `apps/server/src/domain/<name>/` follows three strict
layers. This split is deliberate and load-bearing — don't collapse it, even
for a small domain:

1. **`<name>.sql.ts` — repo layer.** Mechanical Postgres access only, one
   `makeSql<Name>Repo(sql: SqlClient): <Name>RepoService` factory function.
   - Missing rows return `null` / empty array / `false` — **never** a domain
     "not found" error. The repo doesn't get to decide what "missing" means.
   - Every query pipes through one shared `mapSqlError(operation)` helper
     that converts any `SqlError` into a typed `<Name>RepoError` (a catch-all
     with `operation`/`sqlState`/`constraint`/`cause`, `httpApiStatus: 500`).
   - The only exception: a DB-detected constraint violation the repo is
     uniquely positioned to observe (e.g. a unique-index conflict via
     `Effect.catchReason("SqlError", "UniqueViolation", ...)`) may raise the
     specific domain error directly, since only the database can detect that
     race-safely.
2. **`<name>.ts` — service layer.** Two `Context.Service` classes:
   `<Name>Repo` (thin wrapper: `Layer.effect` that resolves `SqlClient` and
   calls the `.sql.ts` factory) and `<Name>` (the real service, depending on
   `<Name>Repo`). The service layer is what turns the repo's `null` into a
   typed domain error (`UserNotFound`, etc.) — that decision belongs here,
   not in the repo and not in the HTTP handler.
3. **`<name>.http.ts` — handler layer.** `HttpApiBuilder.group(Api, "<name>",
   ...)`. Handlers are thin passthroughs to the service — `.handle("op", ({
   params }) => service.op(params.id))` — and raise nothing themselves.

**`Effect.orDie` / converting an error to a defect is reserved for
unrecoverable infrastructure failure** (e.g. the startup Postgres
connectivity check in `index.ts`). It must never be used per-handler to wave
away a routine, typed, recoverable error like a failed query — that error
should stay in the typed channel, be declared on the `HttpApiEndpoint`, and
surface as a real (if generic) HTTP response. A handler that can't reach the
database is not the same kind of failure as the process failing to start.

Domain errors are a **flat union** (`UserNotFound | UserContactNotFound |
UserContactConflict`, each its own `Schema.TaggedErrorClass` with an
`httpApiStatus`), not wrapped in an umbrella `{ reason: Schema.Union([...]) }`
error — endpoints declare the flat errors directly in their `error` field.

## API composition

`packages/schema/src/api/index.ts` defines the root `Api` (`HttpApi.make(...)`
aggregating every domain's `HttpApiGroup`). Each domain group gets its own
path prefix via `.prefix("/user")` on the group; a global prefix (if ever
needed) goes on `Api` itself via `.prefix(...)`.

`apps/server/src/index.ts` is the single composition root — it assembles
config, Postgres, every domain's handler layer, the Bun HTTP server, Swagger
(`/docs`), and the pretty console logger, then runs via `BunRuntime.runMain`
+ `Layer.launch`. There is intentionally no second copy of this wiring
elsewhere — if you add a domain, wire its `*ApiHandlers` layer and its
service's `PgLive`-provided layer directly into this file.

## Database

Single migration file so far: `apps/server/db/migrations/001_create_tables.sql`.
Tables: `external_systems`, `users`, `external_user_links`, `user_contacts`,
`user_preferences`, `notification_templates`, `channel_providers`,
`notifications`, `notification_deliveries`, `provider_usage_log`. Soft
deletes via nullable `deleted_at` almost everywhere (`provider_usage_log` is
the one intentional exception — pure append-only log).

`bun run migrate` (from repo root) runs `apps/server/db/migrate.ts` against
`DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER`/`DB_PASS` — loaded from
`apps/server/.env` (copy `apps/server/.env.example`). Same vars, plus
`APP_PORT`, are read by the server itself via `apps/server/src/config/config.ts`.

## Current domain status

- `users` — complete: repo/service/handler layers, full CRUD +
  contacts/preferences, Swagger-documented.
- `notifications` — schema/types only, no service or HTTP layer yet.
- `apps/web` — untouched scaffold, not connected to the API.
