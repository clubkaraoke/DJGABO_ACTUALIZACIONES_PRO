# Dockerfile del API — se construye con contexto en la RAÍZ del monorepo:
#   docker build -f apps/api/Dockerfile -t djgabo-api .
# (docker-compose.yml ya apunta el context correctamente)

FROM node:22-slim AS base
WORKDIR /repo
RUN apt-get update && apt-get install -y --no-install-recursive python3 make g++ && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/storage/package.json packages/storage/package.json
COPY apps/api/package.json apps/api/package.json
RUN npm install --workspaces --if-present --include-workspace-root

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN npm run build --workspace=packages/shared \
 && npm run build --workspace=packages/domain \
 && npm run build --workspace=packages/storage \
 && npm run build --workspace=apps/api

FROM node:22-slim AS runtime
WORKDIR /repo
ENV NODE_ENV=production
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/package.json ./package.json
COPY --from=build /repo/packages ./packages
COPY --from=build /repo/apps/api ./apps/api
RUN mkdir -p /repo/apps/api/data
EXPOSE 4000
WORKDIR /repo/apps/api
CMD ["node", "dist/server.js"]
