import type { FastifyInstance } from "fastify";
import { desc } from "drizzle-orm";
import { StorageIndexerService } from "@djgabo/storage";
import type { SyncStatusDTO } from "@djgabo/shared";
import { DrizzleIndexerRepository } from "../../db/drizzleIndexerRepository.js";
import { syncRuns } from "../../db/schema.js";

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
    return reply.send(result);
  });
}
