# one-way-notification

A notification service: external systems register, link their users, and send
notifications (email / SMS / Telegram) with per-channel delivery tracking.
One-way — this project sends notifications outward; it does not handle
inbound replies.

## Monorepo layout

Bun workspaces, not Turborepo/Nx.

- `apps/server` — the API, built on Effect. Owns the Postgres schema
  (`apps/server/db/migrations/`).
- `apps/web` — Next.js app, the admin dashboard for the API. Client
  Components fetch via TanStack Query wrapping a thin `HttpApiClient`
  (`lib/api-client.ts`, `lib/api/*.ts`). UI is built on shadcn/ui
  (`components/ui/*`, Tailwind v4 + Base UI primitives under
  `components.json`'s `base-nova` preset) — not hand-rolled Tailwind-only
  components. Domain-specific wrapper components (`components/*.tsx` outside
  `ui/`) compose shadcn primitives into the app's own API (e.g. `Card`,
  `DataTable`, `SelectField`).
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

`apps/server/src/app.ts` is the single composition root for routes — it
assembles Postgres, every domain's handler layer and Swagger (`/docs`) into
`AppRoutes`. `apps/server/src/index.ts` only launches it (config, Bun HTTP
server, CORS, pretty logger, `BunRuntime.runMain` + `Layer.launch`); the
test suite mounts the same `AppRoutes` in-process via
`HttpRouter.toWebHandler`. There is intentionally no second copy of this
wiring — if you add a domain, wire its `*ApiHandlers` layer into `app.ts`.

## Database

Migrations in `apps/server/db/migrations/`, applied in filename order:
`001_create_tables.sql` (`external_systems`, `users`, `external_user_links`,
`user_contacts`, `user_preferences`, `notification_templates`,
`channel_providers`, `notifications`, `notification_deliveries`,
`provider_usage_log`), `002_create_brand_assets.sql` (`brand_assets`) and
`003_provider_configuration.sql` (provider `kind`, `config`, encrypted
`secrets`, `secret_keys`, `priority` on `channel_providers`).
Soft deletes via nullable `deleted_at` almost everywhere
(`provider_usage_log` is the one intentional exception — pure append-only
log). `brand_assets` additionally has `replaced_at`: a replaced asset is
still served (sent emails reference its URL), a deleted one is not.

Record schemas in `@repo/schema` type every timestamp as `Schema.Date` —
that's what the `pg` driver returns. Repos must wrap rows in the record
class (`new XRecord(row)`); returning a plain row fails response encoding.
Every id in the HTTP contract uses the shared `Uuid` schema so malformed ids
are a 400, never a Postgres 22P02 surfacing as a 500.

`bun run migrate` (from repo root) runs `apps/server/db/migrate.ts` against
`DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER`/`DB_PASS` — loaded from
`apps/server/.env` (copy `apps/server/.env.example`). Same vars, plus
`APP_PORT`, `CORS_ORIGINS` (comma-separated allowed origins for the
dashboard, defaults to `http://localhost:3000`) and `PUBLIC_URL` (absolute
origin used for asset URLs in emails, defaults to
`http://localhost:$APP_PORT`) and `PROVIDER_SECRET_KEY` (encrypts provider
credentials; `openssl rand -base64 32`; optional, but saving credentials
fails with `ProviderSecretsUnavailable` until set), are read by the server
itself via `apps/server/src/config/config.ts`. CORS is applied via
`HttpMiddleware.cors` passed as the `middleware` option to
`HttpRouter.serve` in `apps/server/src/index.ts` — not a separate layer.

## Templates and rendering

`apps/server/src/domain/notifications/`:

- `template-engine.ts` — pure parser/renderer. `{{path}}` (HTML-escaped for
  email bodies), `{{{path}}}` (raw), `{{path | default: "x"}}`, `\{{`
  literal. Dotted paths with array indexes; own properties only.
- `notifications.render.ts` — pure channel rules: save-time validation
  (`validateTemplateFields`: syntax, email needs a subject), `system.*`
  built-in variables (name + asset URLs), email layout + text part, SMS
  segment / Telegram length warnings, logo choice (`email_header` → `logo`,
  raster preferred over SVG/WebP/ICO, which Gmail/Outlook don't show).
- `email-layout.ts` — table-based, inline-styled 600px layout; templates
  containing `<html` skip it.

Invalid templates are `NotificationTemplateInvalid` (422, with `issues`).
`POST /api/notification-template/:id/render` renders a saved template;
`POST /api/notification-template/preview` renders an unsaved draft (the
dashboard's live preview).

## Brand assets

`apps/server/src/domain/assets/`. One current asset per (system, kind),
kinds `logo | logo_dark | icon | email_header`. Upload is
`PUT /api/external-system/:id/asset/:kind` with base64 `data` (a `data:`
URL prefix is accepted). `image-inspect.ts` identifies the format from the
bytes only (PNG, JPEG, GIF, WebP VP8/VP8L/VP8X, SVG, ICO), reads
dimensions, caps size (2 MiB) and pixels (8192/side), and rejects SVGs with
scripts, handlers, external references or entities. `GET /api/asset/:id`
serves bytes with the sniffed type, immutable caching, `nosniff`, and a
sandboxing CSP for SVG.

## Providers

`packages/schema/src/providers/provider-kinds.ts` is the catalog of
integrations (own-domain SMTP, SendGrid, Mailgun, Amazon SES, Postmark,
Resend, Twilio, Vonage, Telegram bot): each kind's fields, which are
secret, defaults and `validateProviderConfig`. The server validates with it
and the dashboard renders provider forms from it — add a provider kind
there, nowhere else. Secrets are AES-256-GCM encrypted
(`apps/server/src/domain/providers/provider-secrets.ts`) with the provider
id as associated data, and are never returned by the API — records expose
only `secret_keys`. On update, a secret value of `""` keeps it, `null`
clears it. `Providers.resolveProviderCredentials(id)` is the (non-HTTP)
way for a future delivery worker to get decrypted settings.

## Statistics

`GET /api/stats/overview?days=30&timezone=Europe/Paris` (domain
`apps/server/src/domain/stats/`) powers the overview dashboard: totals by
status, previous-period totals, per-day series counted in the given
timezone, channels, providers (attempts + cost from `provider_usage_log`),
top event types / systems, recent failures, inventory. Deliveries are
windowed by `created_at` with their current status. `bun run seed:demo`
(templates and payloads in `db/seed-catalog.ts`, checked by
`test/seed-catalog.test.ts`)
fills a dev database (name must contain dev/test/demo/local) with ~45 days
of deterministic traffic.

## Template editor

`apps/web/components/template-editor.tsx` is CodeMirror 6: HTML mode for
email, `{{ }}` highlighting, `{{` variable completion (payload keys +
`system.*`), toolbar snippets, inline error marks from preview issues, and
`@` image completion. Image suggestions come from the sources in
`apps/web/lib/asset-sources.ts` (`ASSET_SOURCES`) — brand assets today; the
planned file API plugs in as another `AssetSource` there.

## Tests

- `bun run test` (repo root) — server unit + HTTP integration tests
  (`apps/server/test/`). The preload (`test/setup.ts`) creates and rebuilds
  `notification_test` (override with `TEST_DB_NAME`; it refuses any name
  without "test") using `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASS` from
  `apps/server/.env`. Image fixtures live in `test/fixtures/`.
- `bun run typecheck` — `tsc -b` over server + schema.
- `bun --cwd=apps/web run e2e` — Playwright e2e of the dashboard. Starts its
  own API (port 3101, database `notification_e2e_test`, rebuilt and
  demo-seeded each run) and `next dev` (port 3201). Stop a running `dev:web` first — two
  `next dev` processes can't share `apps/web/.next`.
- `bun --cwd=apps/web run lint`.

## Current domain status

- `users` — complete: repo/service/handler layers, full CRUD +
  contacts/preferences, Swagger-documented. Users have an optional `name`;
  every API shape that refers to a user carries `display_name` from the
  `user_labels` view (name → email contact → linked external id → short id).
  The dashboard never shows a raw UUID as a label — use names, with
  `IdChip` for the rare copy-the-id case.
- `notifications` — templates (CRUD, validation, render/preview).
  `POST /notification` plans one delivery per channel that has a template
  (skipped, with the reason, when the user turned the channel off or has no
  contact), in one transaction; 422 for unknown users or events with no
  template. Idempotency keys are scoped per external system.
- `delivery` — the pipeline. `delivery.worker.ts` runs inside the API
  process (`DELIVERY_WORKER_ENABLED`, safe in several replicas): it claims due
  deliveries with `FOR UPDATE SKIP LOCKED` plus a lease (`locked_until`),
  renders at send time, tries active providers of the channel in priority
  order (healthy ones first), and retries with backoff (`backoff.ts`) up to
  `max_attempts`. At-least-once: a crash mid-send means the lease expires and
  it is sent again. Every provider call goes in `provider_usage_log`.
  Provider adapters live in `delivery/senders/` as plain async functions
  behind the `SenderRegistry` service, which tests replace with a scripted
  fake (`test/support.ts` → `fakeSenders`). Provider health / circuit
  breaker: 3 provider-side failures in a row → cooldown (30 s doubling, max
  15 min); recipient errors don't count. Operator API: list/filter, detail
  with attempts, retry, cancel, bulk retry, queue stats, process-now.
  Within a batch, a template's renderer, a channel's providers and a
  provider's credentials are looked up once (`makeBatchCache`).
  `bun run bench` (apps/server/bench) load-tests ingest and parallel workers
  against a throwaway `notification_bench` database with a slow, flaky fake
  provider, and fails if anything is lost or sent twice.
- `auth` — dashboard sign-in. `admins` (Argon2id via `Bun.password`, lock
  after 5 failures for 15 min) and `admin_sessions` (only a SHA-256 of the
  `own_…` bearer token is stored, 12 h lifetime). A global
  `HttpRouter.middleware` (`auth.middleware.ts`) requires a session on every
  `/api` route except health, login, public asset files, and
  `POST /api/notification` sent with `X-Api-Key` (the handler checks the key
  belongs to the payload's external system). First admin from
  `ADMIN_EMAIL`/`ADMIN_PASSWORD`, or `bun run admin:create -- <email>`.
  Tests sign every request in as `TEST_ADMIN` (`test/support.ts`); pass
  `{ token: null }` to `api()` to go anonymous.
- `providers` — configuration with encrypted credentials (see above).
- `stats` — overview statistics (see above).
- `assets` — complete (see above).
- `apps/web` — admin dashboard covering all domains, wired to the API via
  `@repo/schema`'s `HttpApiClient`. It never calls the API from the browser:
  `/login` posts to `app/api/auth/login`, which seals the API token into an
  HttpOnly cookie (`lib/server/session.ts`, `SESSION_SECRET`); every API call
  goes through `app/api/proxy/[...path]` (adds the bearer, server-side
  `NOTIFY_API_URL`); `proxy.ts` redirects pages to `/login` without a session.
  Lists use `DataTable`'s `rowHref` (whole row opens the record) and never
  show UUIDs. Overview is a statistics dashboard;
  template pages have the CodeMirror editor + live preview; providers have
  catalog-driven config forms; external systems have a brand-assets panel.
  No auth in v1.
