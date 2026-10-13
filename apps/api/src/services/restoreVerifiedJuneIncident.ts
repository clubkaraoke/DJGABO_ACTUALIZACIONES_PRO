import type {FastifyInstance} from "fastify";
import {sqliteClient} from "../db/client.js";
/**
 * Exactly two June-2026 archive attempts, on the day/time in the client's
 * screenshot, must belong to the activated VIP associated with the WhatsApp.
 * No inference from IP alone. If anything differs, do nothing and expose the
 * attempts for manual review in Admin.
 */
export function restoreVerifiedJuneIncident(app:FastifyInstance):void {
  const sql=sqliteClient(app.db);
  const marker="20261013-incident-june-2026-5216123488955";
  const already=sql.prepare("SELECT name FROM djgabo_feature_migrations WHERE name=?").get(marker);
  if(already)return;
  const authorized=sql.prepare("SELECT used_user_id FROM vip_allowed_phones WHERE phone=? AND revoked=0 AND used_user_id IS NOT NULL")
    .get("5216123488955") as {used_user_id:string}|undefined;
  if(!authorized){
    app.log.warn("[JUNE_DOWNLOAD_RESTITUTION_PENDING] WhatsApp not linked to a registered VIP; Admin review required");
    return;
  }
  const collection=sql.prepare("SELECT id FROM collections WHERE year=2026 AND month=6").get() as {id:string}|undefined;
  if(!collection)return;
  const start=Math.floor(Date.parse("2026-10-13T18:15:00Z")/1000);
  const end=Math.floor(Date.parse("2026-10-13T18:23:00Z")/1000);
  const existing=sql.prepare("SELECT id,status,quota_reversed_at FROM download_logs WHERE user_id=? AND collection_id=? AND type='COLLECTION_ARCHIVE' AND created_at>=? AND created_at<=? ORDER BY created_at")
    .all(authorized.used_user_id,collection.id,start,end) as Array<{id:string;status:string;quota_reversed_at:number|null}>;
  if(existing.length!==2 || existing.some(r=>r.quota_reversed_at || !["LEGACY","COMPLETE"].includes(r.status))){
    app.log.warn({attemptsFound:existing.length},"[JUNE_DOWNLOAD_RESTITUTION_PENDING] Need manual review; expected exactly two chargeable attempts");
    return;
  }
  sql.transaction(()=>{
    for(const row of existing){
      sql.prepare("UPDATE download_logs SET quota_reversed_at=?,quota_reversal_reason=?,quota_reversed_by=? WHERE id=? AND quota_reversed_at IS NULL")
        .run(Math.floor(Date.now()/1000),"Incidente verificado 13/10/2026: error Dropbox 500 y ZIP interrumpido","AUTOMATIC_VERIFIED_INCIDENT",row.id);
    }
    sql.prepare("INSERT OR IGNORE INTO djgabo_feature_migrations(name) VALUES(?)").run(marker);
  })();
  app.log.info({userId:authorized.used_user_id,restoredCount:2,collectionId:collection.id},"[JUNE_DOWNLOAD_RESTITUTION_DONE]");
}
