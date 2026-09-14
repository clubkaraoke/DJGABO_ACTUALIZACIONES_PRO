import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";

export function createDb(databaseUrl: string) {
  // DATABASE_URL viene como "file:./prisma/dev.db" por convención (compatible
  // con el mismo formato que se usaría en un futuro con Postgres); acá solo
  // nos interesa la ruta del archivo.
  const filePath = databaseUrl.replace(/^file:/, "");
  const sqlite = new Database(filePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema });
}

export type Db = ReturnType<typeof createDb>;
