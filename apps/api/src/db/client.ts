import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";

const DEFAULT_OFFERS = [
  {slug:"pro-mensual",title:"1 MES",price:"59.99",period:"/ mes",description:"¡Empieza a renovar tu karaoke!",items:["Elige 3 actualizaciones de 2026","3 karaokes a pedido GRATIS"],annualBonus:null},
  {slug:"pro-semestral",title:"6 MESES",price:"149.99",period:"/ 6 meses",description:"¡Nuevos karaokes VIP cada mes!",items:["Acceso Carpeta VIP 2026","6 meses de nuevas actualizaciones","5 karaokes a pedido GRATIS cada mes","Acceso a tu panel VIP por 6 meses"],annualBonus:null},
  {slug:"pro-anual",title:"1 AÑO",price:"189.99",period:"/ año",description:"Todas nuestras Actualizaciones VIP",items:["Acceso Carpeta VIP 2026 - 2012","12 meses de nuevas actualizaciones","15 karaokes a pedido GRATIS cada mes","Todas las colecciones habilitadas para descargar"],annualBonus:"¡Hasta 180 karaokes a pedido GRATIS durante tu año VIP!"},
];
function seedMarketing(sqlite: Database.Database) {
  const stmt=sqlite.prepare("INSERT OR IGNORE INTO plan_marketing(slug,title,price,period,description,items,annual_bonus,updated_at) VALUES (?,?,?,?,?,?,?,?)");
  for (const m of DEFAULT_OFFERS) stmt.run(m.slug,m.title,m.price,m.period,m.description,JSON.stringify(m.items),m.annualBonus,Date.now());
}
export function sqliteClient(db: Db): Database.Database {
  return (db as unknown as { $client: Database.Database }).$client;
}
export function createDb(databaseUrl: string) {
  // DATABASE_URL viene como "file:./prisma/dev.db" por convención (compatible
  // con el mismo formato que se usaría en un futuro con Postgres); acá solo
  // nos interesa la ruta del archivo.
  const filePath = databaseUrl.replace(/^file:/, "");
  const sqlite = new Database(filePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(`CREATE TABLE IF NOT EXISTS vip_allowed_phones (
    phone TEXT PRIMARY KEY, reference_email TEXT, verification_hash TEXT,
    verification_expires INTEGER, used_user_id TEXT UNIQUE, used_at INTEGER,
    revoked INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS plan_marketing (
    slug TEXT PRIMARY KEY, title TEXT NOT NULL, price TEXT NOT NULL,
    period TEXT NOT NULL, description TEXT NOT NULL,
    items TEXT NOT NULL, annual_bonus TEXT,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS djgabo_feature_migrations (name TEXT PRIMARY KEY);`);
  const userColumns = sqlite.prepare("PRAGMA table_info(users)").all() as Array<{name:string}>;
  if (userColumns.length && !userColumns.some(c => c.name === "legacy_pending_expiry")) {
    sqlite.exec("ALTER TABLE users ADD COLUMN legacy_pending_expiry INTEGER NOT NULL DEFAULT 0");
  }
  // One-time transition: October 2026 is still being prepared; keep earlier months untouched.
  const migration = sqlite.prepare("INSERT OR IGNORE INTO djgabo_feature_migrations(name) VALUES (?)").run("20261013-october-preparing");
  if (migration.changes && sqlite.prepare("SELECT name FROM sqlite_master WHERE name=?").get("collections")) sqlite.prepare("UPDATE collections SET active=0 WHERE year=2026 AND month=10").run();
  // Legacy phone allowlist is seeded only from the private Railway environment.
  try {
    const contacts = JSON.parse(process.env.VIP_INITIAL_ALLOWED_CONTACTS ?? "[]") as Array<{phone:string;email?:string}>;
    const stmt=sqlite.prepare("INSERT OR IGNORE INTO vip_allowed_phones(phone,reference_email,created_at) VALUES (?,?,?)");
    for(const contact of contacts) {
      if (/^[0-9]{8,15}$/.test(contact.phone)) stmt.run(contact.phone,contact.email??null,Date.now());
    }
  } catch { throw new Error("VIP_INITIAL_ALLOWED_CONTACTS is not valid JSON"); }
  seedMarketing(sqlite);
  const offerCols=sqlite.prepare("PRAGMA table_info(plan_marketing)").all() as Array<{name:string}>;
  if (!offerCols.some(c=>c.name==="free_requests_per_month")) {
    sqlite.exec("ALTER TABLE plan_marketing ADD COLUMN free_requests_per_month INTEGER NOT NULL DEFAULT 0");
    const rows=sqlite.prepare("SELECT slug,items FROM plan_marketing").all() as Array<{slug:string;items:string}>;
    const standard:Record<string,number>={"pro-mensual":3,"pro-semestral":5,"pro-anual":15};
    const update=sqlite.prepare("UPDATE plan_marketing SET free_requests_per_month=? WHERE slug=?");
    const init=sqlite.transaction(()=>{
      for (const row of rows) {
        let amount=standard[row.slug]??0;
        try {
          const lines=JSON.parse(row.items) as string[];
          const existing=lines.map(line=>line.match(/\b(\d+)\s+karaokes?\s+a\s+pedido\s+gratis\b/i)).find(Boolean);
          if(existing)amount=Number(existing[1]);
        } catch { /* existing unusual copy: use tier default */ }
        update.run(amount,row.slug);
      }
    });
    init();
  }
  return drizzle(sqlite, { schema });
}

export type Db = ReturnType<typeof createDb>;
