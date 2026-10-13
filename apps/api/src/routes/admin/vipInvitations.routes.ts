import type { FastifyInstance } from "fastify";
import { createHmac, randomInt } from "node:crypto";
import { z } from "zod";
import { sqliteClient } from "../../db/client.js";
import { normalizeVipPhone } from "../../services/vipPhones.js";
import { getPlanOffer } from "../../services/planOffers.js";
import { createVipInviteMessage } from "../../services/vipInviteMessage.js";

const addSchema = z.object({whatsapp:z.string().min(8).max(40),email:z.string().email().optional()});
export async function registerAdminVipInvitationsRoutes(app:FastifyInstance) {
  const auth={preHandler:[app.authenticate, app.requireRole("ADMIN")]};
  const sql=sqliteClient(app.db);
  app.get("/api/admin/vip-invitations",auth,async () => {
    const rows=sql.prepare("SELECT phone,reference_email,used_user_id,used_at,revoked,verification_expires FROM vip_allowed_phones ORDER BY created_at DESC").all();
    return {inviteUrl:app.env.VIP_MIGRATION_INVITE_CODE ? "https://www.gabokaraoke.com/acceso-vip/"+encodeURIComponent(app.env.VIP_MIGRATION_INVITE_CODE):null,contacts:rows};
  });
  app.post("/api/admin/vip-invitations",auth,async(req,reply)=>{
    const p=addSchema.safeParse(req.body);if(!p.success) return reply.code(400).send({error:"INVALID_INPUT"});
    const phone=normalizeVipPhone(p.data.whatsapp);if(!phone) return reply.code(400).send({error:"INVALID_WHATSAPP"});
    const old=sql.prepare("SELECT used_user_id FROM vip_allowed_phones WHERE phone=?").get(phone) as {used_user_id:string|null}|undefined;
    if (old?.used_user_id) return reply.code(409).send({error:"ALREADY_REGISTERED"});
    sql.prepare("INSERT INTO vip_allowed_phones(phone,reference_email,created_at,revoked) VALUES(?,?,?,0) ON CONFLICT(phone) DO UPDATE SET reference_email=excluded.reference_email,revoked=0")
      .run(phone,p.data.email??null,Date.now());
    return reply.code(201).send({phone});
  });
  app.delete<{Params:{phone:string}}>("/api/admin/vip-invitations/:phone",auth,async(req,reply)=>{
    const phone=normalizeVipPhone(req.params.phone);if(!phone) return reply.code(400).send({error:"INVALID_WHATSAPP"});
    sql.prepare("UPDATE vip_allowed_phones SET revoked=1,verification_hash=NULL,verification_expires=NULL WHERE phone=? AND used_user_id IS NULL").run(phone);
    return reply.code(204).send();
  });
  app.post<{Params:{phone:string}}>("/api/admin/vip-invitations/:phone/code",auth,async(req,reply)=>{
    const phone=normalizeVipPhone(req.params.phone);if(!phone)return reply.code(400).send({error:"INVALID_WHATSAPP"});
    const row=sql.prepare("SELECT used_user_id,revoked FROM vip_allowed_phones WHERE phone=?").get(phone) as {used_user_id:string|null;revoked:number}|undefined;
    if(!row || row.revoked || row.used_user_id)return reply.code(409).send({error:"NOT_ELIGIBLE"});
    const annual=getPlanOffer(app.db,"pro-anual");
    if(!annual)return reply.code(503).send({error:"VIP_PLAN_UNAVAILABLE"});
    const code=String(randomInt(100000,1000000));
    const hash=createHmac("sha256",app.env.JWT_ACCESS_SECRET).update(phone+":"+code).digest("hex");
    sql.prepare("UPDATE vip_allowed_phones SET verification_hash=?,verification_expires=? WHERE phone=?").run(hash,Date.now()+24*60*60*1000,phone);
    const url=app.env.VIP_MIGRATION_INVITE_CODE ? "https://www.gabokaraoke.com/acceso-vip/"+encodeURIComponent(app.env.VIP_MIGRATION_INVITE_CODE):"";
    const message=createVipInviteMessage(url,code,annual);
    return {code,message,whatsappUrl:"https://wa.me/"+phone+"?text="+encodeURIComponent(message),expiresHours:24};
  });
}
