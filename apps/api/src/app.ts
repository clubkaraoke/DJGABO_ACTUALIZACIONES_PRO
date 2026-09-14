import Fastify, { type FastifyInstance, type FastifyError } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { AuthorizationService } from "@djgabo/domain";
import type { StorageProvider } from "@djgabo/storage";

import type { Env } from "./env.js";
import type { Db } from "./db/client.js";
import { authPlugin } from "./auth/authPlugin.js";
import { DrizzleAuthorizationRepository } from "./db/drizzleAuthorizationRepository.js";
import { StorageService } from "./services/StorageService.js";
import { PreviewService } from "./services/PreviewService.js";
import { DownloadService } from "./services/DownloadService.js";
import { BatchDownloadService } from "./services/BatchDownloadService.js";

import { registerAuthRoutes } from "./routes/auth.routes.js";
import { registerCollectionsRoutes } from "./routes/collections.routes.js";
import { registerKaraokesRoutes } from "./routes/karaokes.routes.js";
import { registerDownloadsRoutes } from "./routes/downloads.routes.js";
import { registerPreviewRoutes } from "./routes/preview.routes.js";
import { registerDeviceRoutes } from "./routes/devices.routes.js";
import { registerAdminClientsRoutes } from "./routes/admin/clients.routes.js";
import { registerAdminPlansRoutes } from "./routes/admin/plans.routes.js";
import { registerAdminCollectionsRoutes } from "./routes/admin/collections.routes.js";
import { registerAdminKaraokesRoutes } from "./routes/admin/karaokes.routes.js";
import { registerAdminDownloadsRoutes } from "./routes/admin/downloads.routes.js";
import { registerAdminSyncRoutes } from "./routes/admin/sync.routes.js";

declare module "fastify" {
  interface FastifyInstance {
    db: Db;
    env: Env;
    storageProvider: StorageProvider;
    storageProviderReason: string;
    authorizationService: AuthorizationService;
    storageService: StorageService;
    previewService: PreviewService;
    downloadService: DownloadService;
    batchDownloadService: BatchDownloadService;
  }
}

export interface BuildAppOptions {
  db: Db;
  env: Env;
  storageProvider: StorageProvider;
  storageProviderReason: string;
}

export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: opts.env.NODE_ENV === "development" ? { level: "info" } : { level: "warn" },
  });

  await fastify.register(cors, { origin: opts.env.CORS_ORIGIN, credentials: true });
  await fastify.register(rateLimit, { global: false }); // rate limit se activa por ruta (login/downloads)
  await fastify.register(authPlugin, { env: opts.env });

  fastify.decorate("db", opts.db);
  fastify.decorate("env", opts.env);
  fastify.decorate("storageProvider", opts.storageProvider);
  fastify.decorate("storageProviderReason", opts.storageProviderReason);

  const authRepo = new DrizzleAuthorizationRepository(opts.db);
  const authorizationService = new AuthorizationService(authRepo);
  const storageService = new StorageService(opts.storageProvider);

  fastify.decorate("authorizationService", authorizationService);
  fastify.decorate("storageService", storageService);
  fastify.decorate("previewService", new PreviewService(opts.db, authorizationService, storageService));
  fastify.decorate("downloadService", new DownloadService(opts.db, authorizationService, storageService));
  fastify.decorate(
    "batchDownloadService",
    new BatchDownloadService(opts.db, authorizationService, storageService),
  );

  fastify.get("/api/health", async () => ({
    status: "ok",
    storageProvider: opts.storageProvider.kind,
  }));

  await registerAuthRoutes(fastify, opts.env);
  await registerCollectionsRoutes(fastify);
  await registerKaraokesRoutes(fastify);
  await registerDownloadsRoutes(fastify);
  await registerPreviewRoutes(fastify);
  await registerDeviceRoutes(fastify);
  await registerAdminClientsRoutes(fastify);
  await registerAdminPlansRoutes(fastify);
  await registerAdminCollectionsRoutes(fastify);
  await registerAdminKaraokesRoutes(fastify);
  await registerAdminDownloadsRoutes(fastify);
  await registerAdminSyncRoutes(fastify);

  fastify.setErrorHandler((error: FastifyError, request, reply) => {
    request.log.error(error);
    const statusCode = error.statusCode ?? 500;
    reply.code(statusCode).send({
      error: statusCode === 500 ? "INTERNAL_ERROR" : "REQUEST_ERROR",
      message: statusCode === 500 ? "Error interno del servidor" : error.message,
      statusCode,
    });
  });

  return fastify;
}
