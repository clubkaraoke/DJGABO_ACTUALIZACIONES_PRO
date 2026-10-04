# Dockerfile del frontend — contexto en la RAÍZ del monorepo:
#   docker build -f apps/web/Dockerfile -t djgabo-web .

FROM node:22-slim AS deps
WORKDIR /repo
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm install --workspaces --if-present --include-workspace-root

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
RUN npm run build --workspace=packages/shared
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build --workspace=apps/web

FROM node:22-slim AS runtime
WORKDIR /app
RUN npm install -g serve@14
COPY --from=build /repo/apps/web/dist ./dist
EXPOSE 80
CMD ["sh", "-c", "serve -s dist -l tcp://0.0.0.0:${PORT:-80}"]
