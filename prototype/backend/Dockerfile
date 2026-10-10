# syntax=docker/dockerfile:1
# MyDriver API. Build: docker build -t mydriver-api prototype/backend

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Runtime dependencies only; sharp ships its own prebuilt libvips.
RUN npm ci --omit=dev && npm cache clean --force

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
# The migration runner reads SQL from ../../migrations relative to dist/db.
COPY migrations ./migrations
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# One-off release steps, run before rolling out a new version:
#   docker run --rm --env-file .env mydriver-api node dist/db/migrate.js
#   docker run --rm --env-file .env mydriver-api node dist/db/seed.js
CMD ["node", "dist/index.js"]
