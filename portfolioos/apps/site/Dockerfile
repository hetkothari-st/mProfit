# Build from the monorepo root:  docker build -f apps/site/Dockerfile .
FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/site/package.json apps/site/
# pnpm-workspace.yaml lists this package, so its manifest must exist at install time
COPY eslint-plugin-everypaisa/package.json eslint-plugin-everypaisa/
RUN pnpm install --frozen-lockfile --filter @everypaisa/site... || pnpm install --filter @everypaisa/site...
COPY apps/site apps/site
ARG VITE_SITE_URL
ARG VITE_APP_URL
ARG VITE_CONTACT_EMAIL
ARG VITE_CONTACT_ENDPOINT
ENV VITE_SITE_URL=${VITE_SITE_URL} VITE_APP_URL=${VITE_APP_URL} VITE_CONTACT_EMAIL=${VITE_CONTACT_EMAIL} VITE_CONTACT_ENDPOINT=${VITE_CONTACT_ENDPOINT}
RUN pnpm --filter @everypaisa/site build

FROM nginx:alpine AS runtime
ENV PORT=8080
COPY --from=build /app/apps/site/dist /usr/share/nginx/html
# nginx's image renders /etc/nginx/templates/*.template with envsubst at start
COPY apps/site/nginx.conf /etc/nginx/templates/default.conf.template
EXPOSE 8080
