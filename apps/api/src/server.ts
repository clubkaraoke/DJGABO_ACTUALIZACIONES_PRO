import "dotenv/config";
import { loadEnv } from "./env.js";
import { createDb } from "./db/client.js";
import {
  getStorageProvider,
  bootstrapMockStorageFromDb,
  seedPendingDropboxFiles,
  seedSyntheticArchives,
} from "./storage/storageInstance.js";
import { buildApp } from "./app.js";

async function main() {
  const env = loadEnv();
  const db = createDb(env.DATABASE_URL);
  const { provider, reason } = getStorageProvider(env);
  await bootstrapMockStorageFromDb(db, provider);
  await seedSyntheticArchives(db, provider);
  seedPendingDropboxFiles(provider);

  const app = await buildApp({ db, env, storageProvider: provider, storageProviderReason: reason });

  app.log.info(`Storage provider activo: ${provider.kind} (${reason})`);

  await app.listen({ port: env.PORT, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error("❌ Error fatal al iniciar el API:", err);
  process.exit(1);
});
