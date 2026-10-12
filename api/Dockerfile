# syntax=docker/dockerfile:1

# =============================================================================
# Stage 1 — dependencies (cached independently of source changes)
# =============================================================================
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
# `npm ci` installs exactly the lockfile, unlike `npm install` which may drift.
RUN npm ci

# =============================================================================
# Stage 2 — build
# =============================================================================
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY prisma ./prisma
# Generate the Prisma client before compiling — the build imports its types.
RUN npx prisma generate
COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npm run build

# =============================================================================
# Stage 3 — production dependencies only
# =============================================================================
FROM node:22-alpine AS prod-deps
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npx prisma generate

# =============================================================================
# Stage 4 — runtime
# The final image carries no compiler, no dev dependencies and no source.
# =============================================================================
FROM node:22-alpine AS runtime
WORKDIR /app

# dumb-init reaps zombies and forwards SIGTERM, so Nest's shutdown hooks run
# and Prisma disconnects cleanly instead of the container being killed.
RUN apk add --no-cache dumb-init

ENV NODE_ENV=production
ENV PORT=4000

COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build     --chown=node:node /app/dist ./dist
COPY --chown=node:node prisma ./prisma
COPY --chown=node:node package.json ./

# Never run as root: a container escape should not land on uid 0.
USER node

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
