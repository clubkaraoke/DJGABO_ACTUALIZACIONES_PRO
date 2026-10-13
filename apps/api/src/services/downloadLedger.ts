import type { FastifyInstance } from "fastify";
import { sqliteClient } from "../db/client.js";

export type DownloadOutcome = "IN_PROGRESS" | "COMPLETE" | "FAILED" | "INTERRUPTED" | "LEGACY";
export function settleDownloadLog(
  db:FastifyInstance["db"], id:string, status:Exclude<DownloadOutcome,"LEGACY"|"IN_PROGRESS">,
  errorCode?:string, bytesSent?:number
):boolean{
  const sql=sqliteClient(db);
  const result=sql.prepare(
    "UPDATE download_logs SET status=?,finished_at=?,error_code=?,bytes_sent=? WHERE id=? AND status='IN_PROGRESS'"
  ).run(status,Math.floor(Date.now()/1000),errorCode??null,bytesSent??null,id);
  return result.changes===1;
}
/** A streaming process may crash before it sees 'close'. Its attempts must not burn the customer's quota forever. */
export function expireOrphanedDownloads(db:FastifyInstance["db"]):void {
  const sql=sqliteClient(db);
  const cutoff=Math.floor((Date.now()-6*60*60*1000)/1000);
  sql.prepare("UPDATE download_logs SET status='INTERRUPTED',finished_at=?,error_code='SERVER_RESTART' WHERE status='IN_PROGRESS' AND created_at<?")
    .run(Math.floor(Date.now()/1000),cutoff);
}
export function isChargedDownload(log:{status:string;quotaReversedAt:Date|null}):boolean{
  return !log.quotaReversedAt && ["IN_PROGRESS","COMPLETE","LEGACY"].includes(log.status);
}
export function trackStreamingOutcome(
  fastify:FastifyInstance,
  reply: { raw: import("node:http").ServerResponse },
  stream:import("node:stream").Readable,
  logId:string
):void{
  let failure:string|null=null;
  // Never attach a data listener before Fastify pipes the ZIP: that could
  // consume bytes before the response is connected.
  const bytes: number | undefined = undefined;
  stream.once("error",(error)=>{
    failure=error instanceof Error?error.message:"STREAM_ERROR";
    settleDownloadLog(fastify.db,logId,"FAILED",failure.slice(0,300),bytes);
  });
  reply.raw.once("finish",()=>{
    // 'finish' means sent to the transport; it is NOT proof the browser saved a valid ZIP.
    if(failure){settleDownloadLog(fastify.db,logId,"FAILED",failure.slice(0,300),bytes);}
    else settleDownloadLog(fastify.db,logId,"COMPLETE",undefined,bytes);
  });
  reply.raw.once("close",()=>{
    if(!reply.raw.writableFinished){
      settleDownloadLog(fastify.db,logId,failure?"FAILED":"INTERRUPTED",failure?.slice(0,300)??"CLIENT_OR_PROXY_CLOSED",bytes);
      if(!stream.destroyed)stream.destroy();
    }
  });
}
