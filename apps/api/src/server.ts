import "dotenv/config";
import { loadEnv } from "./env.js";
import { createDb } from "./db/client.js";
import {
  getStorageProvider,
  bootstrapMockStorageFromDb,
  seedPendingDropboxFiles,
  seedSyntheticArchives,
} from "./storage/storageInstance.js";
import { StorageIndexerService, parseMonthFolder, parseYearFolder } from "@djgabo/storage";
import { DrizzleIndexerRepository } from "./db/drizzleIndexerRepository.js";
import { buildApp } from "./app.js";

async function main() {
  const env = loadEnv();
  const db = createDb(env.DATABASE_URL);
  const { provider, reason } = getStorageProvider(env);
  await bootstrapMockStorageFromDb(db, provider);
  await seedSyntheticArchives(db, provider);
  seedPendingDropboxFiles(provider);

  const app = await buildApp({ db, env, storageProvider: provider, storageProviderReason: reason });

  // Bootstrap controlado de un mes que ya existía antes de activar el
  // webhook/cursor. Es idempotente y se usa solo durante la migración inicial.
  if (env.BOOTSTRAP_SYNC_MONTH_PATH) {
    const parts = env.BOOTSTRAP_SYNC_MONTH_PATH.split("/").filter(Boolean);
    const year = [...parts].reverse().map(parseYearFolder).find((value) => value !== null) ?? null;
    const month = [...parts].reverse().map(parseMonthFolder).find((value) => value !== null) ?? null;

    if (year !== null && month !== null) {
      const repo = new DrizzleIndexerRepository(db, provider.kind);
      const indexer = new StorageIndexerService(provider, repo);
      const bootstrapResult = await indexer.runMonths(
        [{ path: env.BOOTSTRAP_SYNC_MONTH_PATH, year, month }],
        { dryRun: false },
      );
      console.log(
        "[BOOTSTRAP_MONTH_SYNC]",
        JSON.stringify({
          path: env.BOOTSTRAP_SYNC_MONTH_PATH,
          year,
          month,
          filesDetected: bootstrapResult.filesDetected,
          newCount: bootstrapResult.newCount,
          updatedCount: bootstrapResult.updatedCount,
          errorCount: bootstrapResult.errorCount,
        }),
      );
    }
  }

  // El JSON público siempre nace desde la base persistente antes de aceptar
  // tráfico. En Dropbox real también sembramos el cursor actual para que el
  // siguiente webhook procese solo cambios posteriores, no 30k+ archivos.
  const catalogVersion = await app.catalogJsonService.publishAll();
  if (app.dropboxIncrementalSyncService) {
    await app.dropboxIncrementalSyncService.ensureCursor();
  }

  const collectionDiagnostics = await db.query.collections.findMany({
    orderBy: (c, { desc }) => [desc(c.year), desc(c.month)],
  });
  const karaokeDiagnostics = await db.query.karaokes.findMany();
  const karaokeCountByCollection = new Map<string, number>();
  for (const karaoke of karaokeDiagnostics) {
    karaokeCountByCollection.set(
      karaoke.collectionId,
      (karaokeCountByCollection.get(karaoke.collectionId) ?? 0) + 1,
    );
  }

  console.log(
    "[CATALOG_DIAGNOSTICS]",
    JSON.stringify({
      catalogVersion: catalogVersion.version,
      collections: collectionDiagnostics.map((collection) => ({
        year: collection.year,
        month: collection.month,
        title: collection.title,
        karaokes: karaokeCountByCollection.get(collection.id) ?? 0,
      })),
    }),
  );

  try {
    const july = await app.catalogJsonService.readMonth(2026, 7);
    console.log(
      "[CATALOG_JULY_VERIFY]",
      JSON.stringify({
        version: july.doc.version,
        total: july.doc.karaokes.length,
        brands: july.doc.brands,
      }),
    );
  } catch {
    // Julio puede no existir aún en otras instalaciones.
  }

  console.log(`[STORAGE_PROVIDER] ${provider.kind} (${reason})`);

  await app.listen({ port: env.PORT, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error("❌ Error fatal al iniciar el API:", err);
  process.exit(1);
});
