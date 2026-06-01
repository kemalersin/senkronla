FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# Install only @senkronla/server and its workspace dependency @senkronla/protocol (not client/cli).
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/protocol/package.json packages/protocol/
COPY packages/server/package.json packages/server/
RUN pnpm install --frozen-lockfile --filter @senkronla/server... --ignore-scripts
# tsc is a workspace-root devDependency (not pulled by the filter above).
RUN pnpm add -Dw typescript@^5.7.2 --ignore-scripts

FROM deps AS build
COPY packages/protocol ./packages/protocol
COPY packages/server ./packages/server
COPY openapi.yaml ./
RUN pnpm --filter @senkronla/protocol build && \
    pnpm --filter @senkronla/server build && \
    pnpm deploy --filter=@senkronla/server --prod /deploy/server

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN mkdir -p /data/blobs

# Monorepo layout: repoRoot (../../.. from dist) → /app for openapi.yaml
COPY --from=build /deploy/server ./packages/server
COPY --from=build /app/openapi.yaml ./openapi.yaml

WORKDIR /app/packages/server
EXPOSE 8080
CMD ["node", "dist/index.js"]
