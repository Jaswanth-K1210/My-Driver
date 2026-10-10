# syntax=docker/dockerfile:1
# MyDriver website and operations console: one codebase, two images.
#   customer: docker build --build-arg VITE_API_URL=https://api.mydriver.in -t mydriver-web .
#   admin:    docker build --build-arg VITE_APP_TARGET=admin --build-arg VITE_API_URL=https://api.mydriver.in -t mydriver-admin .
# The API address is baked in at build time (Vite).

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_APP_TARGET=customer
ARG VITE_API_URL
ARG VITE_GOOGLE_CLIENT_ID=""
ARG VITE_PUBLIC_SITE_URL=""
RUN test -n "$VITE_API_URL" || (echo "VITE_API_URL build arg is required" && exit 1)
ENV VITE_APP_TARGET=$VITE_APP_TARGET VITE_API_URL=$VITE_API_URL \
    VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID VITE_PUBLIC_SITE_URL=$VITE_PUBLIC_SITE_URL
RUN npm run check && npx vite build && \
    mkdir /out && cp -r "$( [ "$VITE_APP_TARGET" = admin ] && echo dist-admin || echo dist )"/. /out/

FROM nginx:1.27-alpine
ARG VITE_APP_TARGET=customer
COPY nginx.conf /etc/nginx/conf.d/default.conf
# The console must never be indexed: enable its robots header lines.
RUN if [ "$VITE_APP_TARGET" = admin ]; then sed -i 's/# ADMIN_ONLY //' /etc/nginx/conf.d/default.conf; fi
COPY --from=build /out /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=3s CMD wget -qO- http://127.0.0.1/healthz || exit 1
