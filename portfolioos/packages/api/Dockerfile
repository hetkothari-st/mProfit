FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/api/package.json packages/api/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile || pnpm install

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/api/node_modules ./packages/api/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY . .
RUN cd packages/api && node_modules/.bin/prisma generate
RUN pnpm --filter @portfolioos/shared build
RUN pnpm --filter @portfolioos/api build
# LLM system prompts are inlined as TS string constants now — no .txt
# copy needed. Vehicle fixture JSON still has to ship beside the compiled
# adapter since the adapter reads it at runtime.
RUN mkdir -p packages/api/dist/adapters/vehicle/fixtures && \
    cp packages/api/src/adapters/vehicle/fixtures/dev.json packages/api/dist/adapters/vehicle/fixtures/

FROM node:20-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache openssl
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/api/node_modules ./packages/api/node_modules
COPY --from=build /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=build /app/packages/api/dist ./packages/api/dist
COPY --from=build /app/packages/api/prisma ./packages/api/prisma
COPY --from=build /app/packages/api/package.json ./packages/api/package.json
COPY --from=build /app/packages/shared ./packages/shared
COPY packages/api/start.sh ./start.sh
RUN chmod +x ./start.sh
EXPOSE 3001
CMD ["./start.sh"]
