import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createDb, sqliteClient } from "../src/db/client.js";
import { getPlanOffer, listPlanOffers } from "../src/services/planOffers.js";

describe("Existing admin settings survive upgrade", () => {
  it("migrates 1/2/5 from previously edited benefits, never resetting to defaults", () => {
    const folder = mkdtempSync(join(tmpdir(), "djgabo-legacy-offers-"));
    const filepath = join(folder, "legacy.sqlite");
    try {
      const sql = new Database(filepath);
      sql.exec("CREATE TABLE plan_marketing(slug TEXT PRIMARY KEY,title TEXT NOT NULL,price TEXT NOT NULL,period TEXT NOT NULL,description TEXT NOT NULL,items TEXT NOT NULL,annual_bonus TEXT,updated_at INTEGER NOT NULL)");
      const insert = sql.prepare("INSERT INTO plan_marketing (slug,title,price,period,description,items,annual_bonus,updated_at) VALUES(?,?,?,?,?,?,?,?)");
      insert.run("pro-mensual", "1 MES", "59.99", "/ mes", "Mensual", JSON.stringify(["Elige 3 actualizaciones de 2026", "1 karaokes a pedido GRATIS"]), null, Date.now());
      insert.run("pro-semestral", "6 MESES", "149.99", "/ 6 meses", "Semestral", JSON.stringify(["2 karaokes a pedido GRATIS cada mes"]), null, Date.now());
      insert.run("pro-anual", "1 AÑO", "189.99", "/ año", "Anual", JSON.stringify(["5 karaokes a pedido GRATIS cada mes"]), "¡Hasta 60 karaokes a pedido GRATIS!", Date.now());
      sql.close();

      const db = createDb(filepath);
      expect(listPlanOffers(db).map(o => o.freeRequestsPerMonth)).toEqual([1,2,5]);
      expect(getPlanOffer(db, "pro-mensual")?.items).toContain("1 karaoke a pedido GRATIS cada mes");
      expect(getPlanOffer(db, "pro-anual")?.annualBonus).toContain("60 karaokes");
      sqliteClient(db).prepare("UPDATE plan_marketing SET free_requests_per_month=? WHERE slug=?").run(20,"pro-anual");
      sqliteClient(db).close();

      const reopened = createDb(filepath);
      expect(getPlanOffer(reopened,"pro-anual")?.freeRequestsPerMonth).toBe(20);
      expect(getPlanOffer(reopened,"pro-anual")?.annualBonus).toContain("240 karaokes");
      sqliteClient(reopened).close();
    } finally {
      rmSync(folder,{recursive:true,force:true});
    }
  });
});
