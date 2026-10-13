import "dotenv/config";
import { loadEnv } from "./env.js";
import { createDb, sqliteClient } from "./db/client.js";
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
  let bootstrapTarget: { path: string; year: number; month: number } | null = null;

  // Bootstrap controlado de un mes que ya existía antes de activar el
  // webhook/cursor. Es idempotente y se usa solo durante la migración inicial.
  if (env.BOOTSTRAP_SYNC_MONTH_PATH) {
    const parts = env.BOOTSTRAP_SYNC_MONTH_PATH.split("/").filter(Boolean);
    const year = [...parts].reverse().map(parseYearFolder).find((value) => value !== null) ?? null;
    const month = [...parts].reverse().map(parseMonthFolder).find((value) => value !== null) ?? null;

    if (year !== null && month !== null) {
      bootstrapTarget = { path: env.BOOTSTRAP_SYNC_MONTH_PATH, year, month };
      const repo = new DrizzleIndexerRepository(db, provider.kind);
      const indexer = new StorageIndexerService(provider, repo);
      const bootstrapResult = await indexer.runMonths(
        [bootstrapTarget],
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

    // Si estamos haciendo un bootstrap controlado, reflejamos ese mismo mes
    // al Sheet una vez. Luego se desactiva BOOTSTRAP_SYNC_MONTH_PATH y los
    // siguientes cambios entran solo por webhook incremental.
    if (bootstrapTarget && app.sheetMirrorService.enabled) {
      await app.dropboxIncrementalSyncService.mirrorCurrentMonths(
        [bootstrapTarget],
        catalogVersion.version,
      );
      console.log(
        "[SHEET_BOOTSTRAP_MIRROR]",
        JSON.stringify({
          year: bootstrapTarget.year,
          month: bootstrapTarget.month,
          path: bootstrapTarget.path,
          version: catalogVersion.version,
        }),
      );
    }
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

  // One-time reconciliation of the reported September 2026 stale catalogue.
  // Runs after healthcheck is ready. Never deletes files or historical records.
  if (env.NODE_ENV === "production" && provider.kind === "dropbox" && app.dropboxIncrementalSyncService) {
    void (async () => {
      const sqlite=sqliteClient(db);
      const key="20261013-reconcile-2026-09";
      if (sqlite.prepare("SELECT name FROM djgabo_feature_migrations WHERE name=?").get(key)) return;
      const collection=await db.query.collections.findFirst({where:(c,{and,eq})=>and(eq(c.year,2026),eq(c.month,9))});
      if(!collection)return;
      try {
        const month={path:collection.storagePath,year:2026,month:9};
        const indexer=new StorageIndexerService(provider,new DrizzleIndexerRepository(db,provider.kind));
        const result=await indexer.runMonths([month],{dryRun:false});
        if(result.errorCount)throw new Error("Month reconciliation errors: "+result.errorCount);
        const version=await app.catalogJsonService.publishMonths([month]);
        await app.dropboxIncrementalSyncService!.mirrorCurrentMonths([month],version.version);
        sqlite.prepare("INSERT OR IGNORE INTO djgabo_feature_migrations(name) VALUES(?)").run(key);
        console.log("[RECONCILE_SEPTEMBER_2026_DONE]",JSON.stringify({filesDetected:result.filesDetected,removedCount:result.removedCount,version:version.version,sheetMirror:app.sheetMirrorService.enabled?"sent":"disabled"}));
      } catch(error) {
        console.error("[RECONCILE_SEPTEMBER_2026_ERROR]",error);
      }
    })();
  }

  // Bootstrap masivo controlado del catálogo histórico. Se ejecuta DESPUÉS
  // de levantar HTTP para no bloquear el healthcheck de Railway. Es
  // idempotente: usa la identidad estable de Dropbox y solo crea/actualiza.
  if (env.BOOTSTRAP_SYNC_ROOT_PATH && provider.kind === "dropbox") {
    void (async () => {
      try {
        console.log(
          "[BOOTSTRAP_ROOT_SYNC_START]",
          JSON.stringify({ path: env.BOOTSTRAP_SYNC_ROOT_PATH }),
        );
        const repo = new DrizzleIndexerRepository(db, provider.kind);
        const indexer = new StorageIndexerService(provider, repo);
        const result = await indexer.run(env.BOOTSTRAP_SYNC_ROOT_PATH!, { dryRun: false });
        const version = await app.catalogJsonService.publishAll();
        console.log(
          "[BOOTSTRAP_ROOT_SYNC_DONE]",
          JSON.stringify({
            path: env.BOOTSTRAP_SYNC_ROOT_PATH,
            filesDetected: result.filesDetected,
            newCount: result.newCount,
            updatedCount: result.updatedCount,
            errorCount: result.errorCount,
            version: version.version,
          }),
        );
      } catch (error) {
        console.error("[BOOTSTRAP_ROOT_SYNC_ERROR]", error);
      }
    })();
  }
}

main().catch((err) => {
  console.error("❌ Error fatal al iniciar el API:", err);
  process.exit(1);
});
