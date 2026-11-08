# one-way-notification

Send email, SMS and Telegram notifications from your own systems through one
API, with templates, provider failover, retries and an ops dashboard.

| Path              | What                                                     |
| ----------------- | -------------------------------------------------------- |
| `apps/server`     | API + delivery worker (Bun, Effect)                      |
| `apps/web`        | Ops dashboard (Next.js)                                  |
| `packages/schema` | Shared API contract (`@repo/schema`)                     |

## Run with Docker

```bash
cp .env.example .env              # set DB_PASS, PROVIDER_SECRET_KEY, SESSION_SECRET, ADMIN_*
docker compose up -d --build
```

| Service     | Host port                 | Notes                                            |
| ----------- | ------------------------- | ------------------------------------------------ |
| `backend`   | `API_PORT` (3000)         | runs migrations on start, worker in-process      |
| `dashboard` | `DASHBOARD_PORT` (3001)   | sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`    |

Postgres is not started by default: `DB_HOST=host.docker.internal` reaches a
database on the Docker host. To run one in compose, uncomment `postgres` (and
`depends_on` under `backend`) in `docker-compose.yml` and set `DB_HOST=postgres`.
Mailpit (test SMTP inbox) and an extra delivery worker are there too, commented out.

Serving the dashboard over plain HTTP on a server IP? Set `COOKIE_SECURE=false`,
or the browser drops the session cookie. Behind HTTPS leave it `true`.

Build one image on its own (always from the repo root):

```bash
docker build -f apps/server/Dockerfile -t one-way-notification-api       .
docker build -f apps/web/Dockerfile    -t one-way-notification-dashboard .
```

## Run locally

```bash
bun install
cp apps/server/.env.example apps/server/.env
bun run migrate
bun run dev:server                # API on :3000
PORT=3001 bun run dev:web         # dashboard on :3001
```

| Script                                | What                                          |
| ------------------------------------- | --------------------------------------------- |
| `bun run test`                        | server tests                                  |
| `bun run typecheck`                   | server typecheck                              |
| `bun run seed:demo`                   | demo systems, templates and users (dev only)  |
| `bun run admin:create -- you@x.com`   | create or reset an administrator              |
| `bun run bench`                       | delivery throughput benchmark                 |
