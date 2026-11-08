# API + delivery worker on Bun. Bun runs the TypeScript directly: no build step.
# Build from the repo root (the API uses the shared @repo/schema workspace):
#
#   docker build -f apps/server/Dockerfile -t one-way-notification-api .

# ---- dependencies: production only, frozen lockfile
FROM oven/bun:1.4-slim AS deps
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
# every workspace's package.json, so bun can resolve the lockfile
COPY apps/server/package.json     apps/server/
COPY apps/web/package.json        apps/web/
COPY packages/schema/package.json packages/schema/
RUN bun install --frozen-lockfile --production --filter server --filter @repo/schema

# ---- runtime: minimal, non-root
FROM oven/bun:1.4-slim
WORKDIR /app
ENV NODE_ENV=production
# the whole deps tree: bun's isolated linker keeps per-workspace node_modules
# made of relative symlinks into /app/node_modules/.bun
COPY --from=deps --chown=bun:bun /app                         ./
COPY --chown=bun:bun tsconfig.base.json                       ./
COPY --chown=bun:bun packages/schema                          ./packages/schema
COPY --chown=bun:bun apps/server/tsconfig.json                ./apps/server/
COPY --chown=bun:bun apps/server/src                          ./apps/server/src
COPY --chown=bun:bun apps/server/db                           ./apps/server/db

USER bun
WORKDIR /app/apps/server
EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD bun -e "fetch('http://127.0.0.1:' + (process.env.APP_PORT ?? 3000) + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# apply pending migrations, then serve (the worker runs in the same process)
CMD ["sh", "-c", "bun db/migrate.ts && exec bun src/index.ts"]
