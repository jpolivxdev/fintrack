# syntax=docker/dockerfile:1

# ---------- Build stage: install everything, compile TypeScript ----------
FROM node:26-slim AS build
WORKDIR /app

# `prisma generate` (run on postinstall) reads prisma.config.ts, which needs a
# DATABASE_URL to exist. Nothing connects to it during the build.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build

COPY package*.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npm run build \
 && npm prune --omit=dev

# ---------- Runtime stage: only what is needed to run ----------
FROM node:26-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build --chown=node:node /app/package*.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/prisma.config.ts ./

USER node
EXPOSE 3000

# Apply pending migrations, then start the API.
CMD ["npm", "run", "start:migrate"]
