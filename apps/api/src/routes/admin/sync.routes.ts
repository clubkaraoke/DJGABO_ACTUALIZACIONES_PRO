import type { FastifyInstance } from "fastify";
import { desc } from "drizzle-orm";
import { StorageIndexerService } from "@djgabo/storage";
import type { SyncStatusDTO } from "@djgabo/shared";
import { DrizzleIndexerRepository } from "../../db/drizzleIndexerRepository.js";
import { syncRuns } from "../../db/schema.js";
import { enrichMissingDeezerCovers } from "../../services/deezerCoverService.js";

export async function registerAdminSyncRoutes(fastify: FastifyInstance) {
  const { db } = fastify;
  const guard = { preHandler: [fastify.authenticate, fastify.requireRole("ADMIN")] };

  fastify.get("/api/admin/sync/status", guard, async (_request, reply) => {
    const last = await db.query.syncRuns.findFirst({ orderBy: desc(syncRuns.createdAt) });
    const dto: SyncStatusDTO = {
      provider: fastify.storageProvider.kind,
      lastSyncAt: last?.createdAt.toISOString() ?? null,
      filesDetected: last?.filesDetected ?? 0,
      newCount: last?.newCount ?? 0,
      updatedCount: last?.updatedCount ?? 0,
      errorCount: last?.errorCount ?? 0,
      dryRun: last?.dryRun ?? true,
    };
    return reply.send(dto);
  });

  async function runIndexer(dryRun: boolean) {
    const repo = new DrizzleIndexerRepository(db, fastify.storageProvider.kind);
    const indexer = new StorageIndexerService(fastify.storageProvider, repo);
    return indexer.run(fastify.env.SYNC_ROOT_PATH, { dryRun });
  }

  fastify.post("/api/admin/sync/analyze", guard, async (_request, reply) => {
    const result = await runIndexer(true);
    return reply.send(result);
  });

  fastify.post("/api/admin/sync/run", guard, async (_request, reply) => {
    const result = await runIndexer(false);
    await fastify.catalogJsonService.publishAll();

    // El sync de storage responde sin esperar a Deezer. La portada se resuelve
    // en segundo plano, con concurrencia limitada y persistencia local, para
    // que ni el panel admin ni las páginas del cliente sufran N requests
    // remotos o lag al renderizar tarjetas.
    void enrichMissingDeezerCovers(db, { limit: 60, concurrency: 6 })
      .then(async (covers) => {
        fastify.log.info({ covers }, "Deezer cover enrichment completed");
        if (covers.matched > 0) await fastify.catalogJsonService.publishAll();
      })
      .catch((error) => fastify.log.warn({ err: error }, "Deezer cover enrichment failed"));

    return reply.send(result);
  });

  fastify.post("/api/admin/sync/incremental", guard, async (_request, reply) => {
    if (!fastify.dropboxIncrementalSyncService) {
      return reply.code(409).send({ error: "DROPBOX_INCREMENTAL_DISABLED" });
    }
    const result = await fastify.dropboxIncrementalSyncService.runNow();
    return reply.send(result);
  });
}
