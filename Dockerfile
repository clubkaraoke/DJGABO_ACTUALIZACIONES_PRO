# Railway STAGING: un solo contenedor sirve frontend + API para simplificar pruebas.
# No altera la arquitectura de producción; usa MockStorageProvider y SQLite temporal.

FROM node:22-slim AS build
WORKDIR /repo

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/storage/package.json packages/storage/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --workspaces --include-workspace-root

COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps

RUN npm run build --workspace=packages/shared \
 && npm run build --workspace=packages/domain \
 && npm run build --workspace=packages/storage \
 && npm run build --workspace=apps/api \
 && npm run build --workspace=apps/web

FROM node:22-slim AS runtime
WORKDIR /repo
ENV NODE_ENV=production

RUN apt-get update \
 && apt-get install -y --no-install-recommends nginx tini \
 && rm -rf /var/lib/apt/lists/*

COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/package.json ./package.json
COPY --from=build /repo/packages ./packages
COPY --from=build /repo/apps/api ./apps/api
COPY --from=build /repo/apps/web/dist /var/www/djgabo
COPY railway-start.sh /usr/local/bin/railway-start.sh
RUN chmod +x /usr/local/bin/railway-start.sh \
 && rm -f /etc/nginx/sites-enabled/default /etc/nginx/conf.d/default.conf

EXPOSE 8080
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/usr/local/bin/railway-start.sh"]
