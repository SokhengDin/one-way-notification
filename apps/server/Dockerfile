FROM oven/bun:1.3-alpine AS base
WORKDIR /repo

FROM base AS install
COPY package.json bun.lock bunfig.toml tsconfig.base.json ./
COPY packages/schema/package.json packages/schema/
COPY packages/infra/package.json packages/infra/
COPY apps/agent/package.json apps/agent/
RUN bun install --frozen-lockfile

FROM base AS run
COPY --from=install /repo/node_modules ./node_modules
COPY --from=install /repo/package.json /repo/bunfig.toml /repo/tsconfig.base.json ./
COPY packages/schema packages/schema
COPY packages/infra packages/infra
COPY apps/agent apps/agent

WORKDIR /repo/apps/agent
EXPOSE 4000
CMD ["bun", "run", "src/index.ts"]