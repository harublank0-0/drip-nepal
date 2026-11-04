# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Drip Nepal production image.
#   docker compose -f docker-compose.prod.yml up -d --build
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    HUSKY=0 \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

# All dependencies, for building.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# Compile TypeScript, build the client and SSR bundles into ./build.
FROM deps AS build
COPY . .
RUN node ace build

# Runtime: the compiled app and production dependencies only.
FROM base AS production
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3333
COPY --from=build /app/build ./
COPY --from=build /app/pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --prod --frozen-lockfile --ignore-scripts
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh \
    && mkdir -p /app/storage /app/tmp \
    && chown -R node:node /app/storage /app/tmp
USER node
EXPOSE 3333
VOLUME ["/app/storage"]
ENTRYPOINT ["entrypoint.sh"]
CMD ["node", "bin/server.js"]
