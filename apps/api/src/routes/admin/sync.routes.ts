import type { FastifyInstance } from "fastify";
import { desc, eq, and } from "drizzle-orm";
import { z } from "zod";
import { StorageIndexerService } from "@djgabo/storage";
import type { SyncStatusDTO } from "@djgabo/shared";
import { DrizzleIndexerRepository } from "../../db/drizzleIndexerRepository.js";
import { syncRuns, collections } from "../../db/schema.js";

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
    if(result.errorCount>0) return reply.code(503).send({error:"SYNC_PARTIAL",errors:result.errorCount});
    const version=await fastify.catalogJsonService.publishAll();
    if(fastify.dropboxIncrementalSyncService && result.scannedMonths?.length)
      await fastify.dropboxIncrementalSyncService.mirrorCurrentMonths(result.scannedMonths,version.version);

    // La resolución de portadas usa un worker persistente con caché de hits,
    // misses y errores; no vuelve a barrer ciegamente Deezer en cada sync.
    fastify.coverEnrichmentService.startDrain(async () => {
      await fastify.catalogJsonService.publishAll();
    });

    return reply.send(result);
  });

  // Explicit catch-up for older removals (already past the Dropbox cursor).
  // Never accepts arbitrary paths; the month storagePath comes from DB.
  fastify.post("/api/admin/sync/reconcile-month",guard,async(request,reply)=>{
    const parsed=z.object({year:z.number().int().min(2012).max(2100),month:z.number().int().min(0).max(12),dryRun:z.boolean().optional()}).safeParse(request.body);
    if(!parsed.success)return reply.code(400).send({error:"INVALID_MONTH"});
    const {year,month,dryRun=false}=parsed.data;
    if(!fastify.dropboxIncrementalSyncService)return reply.code(409).send({error:"DROPBOX_INCREMENTAL_DISABLED"});
    const c=await db.query.collections.findFirst({where:and(eq(collections.year,year),eq(collections.month,month))});
    if(!c)return reply.code(404).send({error:"COLLECTION_NOT_FOUND"});
    // Must operate only under the configured Dropbox root.
    // Use the trusted persisted path, not a user-supplied arbitrary location.
    // Some historical month paths are relative to a different yearly sync root.
    if(!c.storagePath.startsWith("/") || c.storagePath.split("/").includes(".."))
      return reply.code(409).send({error:"MONTH_OUTSIDE_SYNC_ROOT"});
    const result=await new StorageIndexerService(
      fastify.storageProvider,new DrizzleIndexerRepository(db,fastify.storageProvider.kind)
    ).runMonths([{path:c.storagePath,year,month}],{dryRun});
    if(result.errorCount) return reply.code(503).send({error:"SYNC_PARTIAL",result});
    if(dryRun)return reply.send(result);
    const version=await fastify.catalogJsonService.publishMonths([{year,month}]);
    await fastify.dropboxIncrementalSyncService.mirrorCurrentMonths([{path:c.storagePath,year,month}],version.version);
    return reply.send({result,version:version.version,sheetMirror:"completed"});
  });

  fastify.post("/api/admin/sync/incremental", guard, async (_request, reply) => {
    if (!fastify.dropboxIncrementalSyncService) {
      return reply.code(409).send({ error: "DROPBOX_INCREMENTAL_DISABLED" });
    }
    const result = await fastify.dropboxIncrementalSyncService.runNow();

    fastify.coverEnrichmentService.startDrain(async () => {
      await fastify.catalogJsonService.publishAll();
    });

    return reply.send(result);
  });
}
