import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { users, plans } from "../../db/schema.js";
import { createId } from "../../db/id.js";
import { sqliteClient } from "../../db/client.js";
import { getPlanOffer } from "../../services/planOffers.js";
import { normalizeVipPhone } from "../../services/vipPhones.js";
import { commercialTier, addMonths } from "../../services/commercialPlans.js";
import { hashPassword } from "../../auth/passwordHash.js";

const planSlugs = ["pro-mensual", "pro-semestral", "pro-anual"] as const;
const methods = ["YAPE_PLIN", "PAYPAL", "OTHER"] as const;
const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().email().max(254),
  whatsapp: z.string().min(8).max(40),
  planSlug: z.enum(planSlugs),
  paymentMethod: z.enum(methods),
  amountPaid: z.string().regex(/^\d{1,6}\.\d{2}$/),
  paymentCurrency: z.enum(["PEN","USD","MXN","BOB","VES"]),
  paymentReference: z.string().trim().max(150).optional(),
  paymentConfirmed: z.literal(true),
});
const setupSchema = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), password: z.string().min(8).max(128) });
const makeToken = () => randomBytes(32).toString("hex");
const digest = (token:string) => createHash("sha256").update(token).digest("hex");
const expiresInMs = 48 * 60 * 60 * 1000;
function setupMessage(url:string, planName:string):string {
  return [
    "🎤 *¡BIENVENIDO A DJGABO VIP!*",
    "",
    "Tu pago fue confirmado y tu membresía *"+planName+"* está activada.",
    "✅ Descarga las actualizaciones incluidas en tu plan.",
    "✅ Escucha demos y solicita tus karaokes gratuitos.",
    "✅ Gestiona tus novedades desde tu panel, sin esperar entregas por WhatsApp.",
    "",
    "🔐 *Configura tu contraseña y entra a tu panel:*",
    url,
    "⏳ Enlace personal válido por 48 horas y de un solo uso.",
    "",
    "*DJGABO ACTUALIZACIONES PRO*",
  ].join("\n");
}
function secureLink(raw:string) {
  // The token is in URL fragment, never sent to the web server as part of GET request.
  return "https://www.gabokaraoke.com/activar-cuenta#token="+raw;
}
function shareLink(phone:string,message:string) {
  return "https://wa.me/"+phone+"?text="+encodeURIComponent(message);
}
export function registerManualClientsRoutes(app:FastifyInstance) {
  const guard={preHandler:[app.authenticate, app.requireRole("ADMIN")]};
  const sql=sqliteClient(app.db);

  app.post("/api/admin/clients/manual",guard,async(req,reply)=>{
    const parsed=createSchema.safeParse(req.body);
    if(!parsed.success)return reply.code(400).send({error:"INVALID_INPUT",message:"Revisa datos, plan y pago confirmado"});
    const info=parsed.data;
    const phone=normalizeVipPhone(info.whatsapp);
    if(!phone)return reply.code(400).send({error:"INVALID_WHATSAPP"});
    const email=info.email.trim().toLowerCase();
    const offer=getPlanOffer(app.db,info.planSlug);
    const plan=await app.db.query.plans.findFirst({where:eq(plans.slug,info.planSlug)});
    const tier=commercialTier(info.planSlug);
    if(!plan||!tier||!offer)return reply.code(400).send({error:"PLAN_UNAVAILABLE"});
    if(await app.db.query.users.findFirst({where:eq(users.email,email)}))
      return reply.code(409).send({error:"EMAIL_ALREADY_REGISTERED",message:"Este correo ya existe. Renueva al cliente desde su ficha."});
    if(sql.prepare("SELECT phone FROM vip_allowed_phones WHERE phone=?").get(phone))
      return reply.code(409).send({error:"PHONE_RESERVED",message:"Este WhatsApp figura como cliente antiguo. Revisa su cuenta antes de crear otra."});
    if(sql.prepare("SELECT phone FROM manual_customer_accounts WHERE phone=?").get(phone))
      return reply.code(409).send({error:"WHATSAPP_ALREADY_REGISTERED",message:"Este WhatsApp ya está asociado a una cuenta."});
    const now=new Date(), start=now;
    const end=tier==="MONTH"?new Date(start.getTime()+30*86400_000):addMonths(start,tier==="SIX_MONTHS"?6:12);
    const userId=createId("usr");
    const raw=makeToken();
    const placeholderPassword=await hashPassword(makeToken()); // never exposed to customer or Admin
    const seconds=Math.floor(now.getTime()/1000);
    try {
      sql.transaction(()=>{
        sql.prepare("INSERT INTO users(id,email,password_hash,name,role,status,plan_id,subscription_start,subscription_end,legacy_pending_expiry,max_devices,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)")
          .run(userId,email,placeholderPassword,info.name,"MEMBER","ACTIVE",plan.id,seconds,Math.floor(end.getTime()/1000),0,plan.maxDevices,seconds,seconds);
        sql.prepare("INSERT INTO manual_customer_accounts(user_id,phone,setup_hash,setup_expires,created_at,updated_at) VALUES(?,?,?,?,?,?)")
          .run(userId,phone,digest(raw),Date.now()+expiresInMs,Date.now(),Date.now());
        sql.prepare("INSERT INTO manual_customer_payments(id,user_id,plan_slug,plan_price_usd,amount_paid,payment_currency,payment_method,payment_reference,period_start,period_end,paid_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
          .run(createId("payment"),userId,info.planSlug,offer.price,info.amountPaid,info.paymentCurrency,info.paymentMethod,info.paymentReference??null,seconds,Math.floor(end.getTime()/1000),seconds);
      })();
    } catch(e){
      const message=e instanceof Error?e.message:"";
      if(message.includes("UNIQUE"))return reply.code(409).send({error:"DUPLICATE_CUSTOMER",message:"Ya existe un cliente con ese correo o WhatsApp."});
      throw e;
    }
    const activationUrl=secureLink(raw);
    const message=setupMessage(activationUrl,offer.title);
    return reply.code(201).send({
      id:userId,name:info.name,email,whatsapp:phone,planSlug:info.planSlug,
      subscriptionStart:start.toISOString(),subscriptionEnd:end.toISOString(),
      activationUrl,whatsappUrl:shareLink(phone,message),message,activationExpiresHours:48,
    });
  });

  app.post<{Params:{id:string}}>("/api/admin/clients/:id/activation-link",guard,async(req,reply)=>{
    const row=sql.prepare("SELECT m.phone,m.setup_consumed,u.email,u.plan_id FROM manual_customer_accounts m INNER JOIN users u ON u.id=m.user_id WHERE m.user_id=?")
      .get(req.params.id) as {phone:string;setup_consumed:number|null;email:string;plan_id:string|null}|undefined;
    if(!row)return reply.code(404).send({error:"MANUAL_CLIENT_NOT_FOUND"});
    if(row.setup_consumed)return reply.code(409).send({error:"ACCOUNT_ALREADY_ACTIVATED",message:"El cliente ya estableció su contraseña."});
    const raw=makeToken(),now=Date.now();
    sql.prepare("UPDATE manual_customer_accounts SET setup_hash=?,setup_expires=?,updated_at=? WHERE user_id=? AND setup_consumed IS NULL")
      .run(digest(raw),now+expiresInMs,now,req.params.id);
    const plan=row.plan_id?await app.db.query.plans.findFirst({where:eq(plans.id,row.plan_id)}):null;
    const offer=plan?getPlanOffer(app.db,plan.slug):null;
    const activationUrl=secureLink(raw),message=setupMessage(activationUrl,offer?.title??"VIP");
    return {activationUrl,whatsappUrl:shareLink(row.phone,message),message,activationExpiresHours:48};
  });

  app.post("/api/auth/activate-manual-client",{config:{rateLimit:{max:5,timeWindow:"1 minute"}}},async(req,reply)=>{
    const parsed=setupSchema.safeParse(req.body);
    if(!parsed.success)return reply.code(400).send({error:"INVALID_INPUT",message:"Revisa tu contraseña (mínimo 8 caracteres)."});
    const tokenHash=digest(parsed.data.token);
    const record=sql.prepare("SELECT user_id FROM manual_customer_accounts WHERE setup_hash=? AND setup_consumed IS NULL AND setup_expires>?")
      .get(tokenHash,Date.now()) as {user_id:string}|undefined;
    if(!record)return reply.code(410).send({error:"LINK_EXPIRED",message:"Este enlace venció o ya fue utilizado. Solicita uno nuevo a DJGABO."});
    const hashed=await hashPassword(parsed.data.password),now=Date.now();
    try{
      sql.transaction(()=>{
        const used=sql.prepare("UPDATE manual_customer_accounts SET setup_hash=NULL,setup_expires=NULL,setup_consumed=?,updated_at=? WHERE user_id=? AND setup_hash=? AND setup_consumed IS NULL AND setup_expires>?")
          .run(now,now,record.user_id,tokenHash,now);
        if(used.changes!==1)throw new Error("TOKEN_ALREADY_USED");
        sql.prepare("UPDATE users SET password_hash=?,updated_at=? WHERE id=?").run(hashed,Math.floor(now/1000),record.user_id);
      })();
    } catch(error){
      if(error instanceof Error && error.message==="TOKEN_ALREADY_USED")return reply.code(410).send({error:"LINK_EXPIRED"});
      throw error;
    }
    return {ok:true};
  });
}
