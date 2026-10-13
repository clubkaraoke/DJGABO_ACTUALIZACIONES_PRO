import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { users, collections } from "../../db/schema.js";
import { sqliteClient } from "../../db/client.js";
import { expireOrphanedDownloads } from "../../services/downloadLedger.js";

const approval=z.object({reason:z.string().trim().min(12).max(300)});
type Row={id:string;collection_id:string|null;created_at:number;status:string;finished_at:number|null;error_code:string|null;quota_reversed_at:number|null;quota_reversal_reason:string|null;quota_reversed_by:string|null};
export function registerAdminDownloadRefundRoutes(fastify:FastifyInstance){
 const guard={preHandler:[fastify.authenticate,fastify.requireRole("ADMIN")]};
 const sql=sqliteClient(fastify.db);
 fastify.get<{Params:{id:string}}>("/api/admin/clients/:id/download-attempts",guard,async(request,reply)=>{
   const user=await fastify.db.query.users.findFirst({where:eq(users.id,request.params.id)});
   if(!user)return reply.code(404).send({error:"CLIENT_NOT_FOUND"});
   expireOrphanedDownloads(fastify.db);
   const attempts=sql.prepare(
     "SELECT id,collection_id,created_at,status,finished_at,error_code,quota_reversed_at,quota_reversal_reason,quota_reversed_by FROM download_logs WHERE user_id=? AND type='COLLECTION_ARCHIVE' ORDER BY created_at DESC LIMIT 80"
   ).all(user.id) as Row[];
   const all=await fastify.db.query.collections.findMany();
   const names=new Map(all.map(x=>[x.id,x.title]));
   return {items:attempts.map(row=>({
     id:row.id,collectionId:row.collection_id,collectionTitle:names.get(row.collection_id??"")??"Colección",
     createdAt:new Date(row.created_at*1000).toISOString(),
     status:row.status,finishedAt:row.finished_at?new Date(row.finished_at*1000).toISOString():null,
     errorCode:row.error_code,
     charged:!row.quota_reversed_at && ["LEGACY","IN_PROGRESS","COMPLETE"].includes(row.status),
     restoredAt:row.quota_reversed_at?new Date(row.quota_reversed_at*1000).toISOString():null,
     restorationReason:row.quota_reversal_reason,restoredBy:row.quota_reversed_by
   }))};
 });
 fastify.post<{Params:{id:string;logId:string}}>("/api/admin/clients/:id/download-attempts/:logId/restore",guard,async(request,reply)=>{
   const parsed=approval.safeParse(request.body);
   if(!parsed.success)return reply.code(400).send({error:"REASON_REQUIRED",message:"Describe el motivo de la restitución (mínimo 12 caracteres)."});
   const user=await fastify.db.query.users.findFirst({where:eq(users.id,request.params.id)});
   if(!user)return reply.code(404).send({error:"CLIENT_NOT_FOUND"});
   const tx=sql.transaction(()=>{
     const found=sql.prepare("SELECT id,status,quota_reversed_at FROM download_logs WHERE id=? AND user_id=? AND type='COLLECTION_ARCHIVE'").get(request.params.logId,user.id) as {id:string;status:string;quota_reversed_at:number|null}|undefined;
     if(!found)return "NOT_FOUND";
     if(found.quota_reversed_at)return "ALREADY_RESTORED";
     if(!["LEGACY","COMPLETE","IN_PROGRESS"].includes(found.status))return "ALREADY_FREE";
     const changed=sql.prepare("UPDATE download_logs SET quota_reversed_at=?,quota_reversal_reason=?,quota_reversed_by=? WHERE id=? AND user_id=? AND quota_reversed_at IS NULL")
       .run(Math.floor(Date.now()/1000),parsed.data.reason,request.authUser!.sub,found.id,user.id);
     return changed.changes===1?"RESTORED":"ALREADY_RESTORED";
   });
   const result=tx();
   if(result==="NOT_FOUND")return reply.code(404).send({error:result});
   if(result==="ALREADY_RESTORED" || result==="ALREADY_FREE")return reply.code(409).send({error:result});
   return {ok:true,logId:request.params.logId,quotaRestored:1};
 });
}
