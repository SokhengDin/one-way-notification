# Dashboard on Bun: Bun installs, builds and runs it (no Node.js in the image).
# Build from the repo root (the dashboard uses the shared @repo/schema workspace):
#
#   docker build -f apps/web/Dockerfile -t one-way-notification-dashboard .

# ---- dependencies (frozen lockfile)
FROM oven/bun:1.4-slim AS deps
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
COPY apps/server/package.json     apps/server/
COPY apps/web/package.json        apps/web/
COPY packages/schema/package.json packages/schema/
RUN bun install --frozen-lockfile --filter web --filter @repo/schema

# ---- build (Next.js standalone output)
FROM oven/bun:1.4-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production
# the whole deps tree: bun's isolated linker keeps per-workspace node_modules
# made of relative symlinks into /app/node_modules/.bun
COPY --from=deps /app                           ./
COPY tsconfig.base.json                         ./
COPY packages/schema                            ./packages/schema
COPY apps/web                                   ./apps/web
# NEXT_PUBLIC_* values are baked in at build time
ARG NEXT_PUBLIC_SITE_URL=""
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
RUN cd apps/web && bun run build

# ---- runtime: minimal, non-root
FROM oven/bun:1.4-slim
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
# runtime config: NOTIFY_API_URL (the API, server-side only), SESSION_SECRET (>= 32 chars),
#                 SECURITY_CONTACT (optional, for /.well-known/security.txt)
COPY --from=build --chown=bun:bun /app/apps/web/.next/standalone ./
COPY --from=build --chown=bun:bun /app/apps/web/.next/static     ./apps/web/.next/static
COPY --from=build --chown=bun:bun /app/apps/web/public           ./apps/web/public

USER bun
EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD bun -e "fetch('http://127.0.0.1:' + (process.env.PORT ?? 3000) + '/login').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["bun", "apps/web/server.js"]
