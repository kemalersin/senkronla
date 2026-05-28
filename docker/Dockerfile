FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages/protocol/package.json packages/protocol/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
COPY packages/cli/package.json packages/cli/
RUN pnpm install --frozen-lockfile || pnpm install

FROM deps AS build
COPY packages ./packages
COPY openapi.yaml ./
RUN pnpm --filter @senkronla/protocol build
RUN pnpm --filter @senkronla/server build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN mkdir -p /data/blobs
COPY --from=build /app/packages/server/dist ./dist
COPY --from=build /app/packages/server/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/server/node_modules ./packages/server/node_modules
COPY --from=build /app/packages/protocol/dist ./packages/protocol/dist
COPY --from=build /app/openapi.yaml ./openapi.yaml
COPY --from=build /app/packages/server/migrations ./migrations
EXPOSE 8080
CMD ["node", "dist/index.js"]
