import { beforeAll, afterAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildTestApp, TEST_PASSWORD } from "./testApp.js";
import { sqliteClient } from "../src/db/client.js";
import { normalizeVipPhone } from "../src/services/vipPhones.js";

describe("VIP old client invite security, migration and publication", () => {
 let app: FastifyInstance;
 let token = "";
 const invite = "shared-invite-code-2026-djgabo";
 const phone = "51987654321";
 beforeAll(async () => {
   ({ app } = await buildTestApp());
   app.env.VIP_MIGRATION_INVITE_CODE = invite;
   const login = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "admin@test.local", password: TEST_PASSWORD } });
   expect(login.statusCode).toBe(200);
   token = login.json().accessToken;
 });
 afterAll(async () => { await app.close(); });
 it("supports Mexican legacy prefixes without duplicate authorizations", () => {
   expect(normalizeVipPhone("https://wa.me/5214499192114")).toBe("524499192114");
   expect(normalizeVipPhone("+51 987 654 321")).toBe("51987654321");
 });
 it("rejects non-whitelisted WhatsApp, even with shared link", async () => {
   const res=await app.inject({method:"POST",url:"/api/auth/vip-invite/register",payload:{inviteCode:invite,email:"stranger@example.com",whatsapp:"51911122233",password:"Pass12345!",verificationCode:"123456"}});
   expect(res.statusCode).toBe(403);
   expect(res.json().error).toBe("WHATSAPP_NOT_AUTHORIZED");
 });
 it("registers the whitelisted customer only after Admin sends a code", async () => {
   const add=await app.inject({method:"POST",url:"/api/admin/vip-invitations",headers:{authorization:"Bearer "+token},payload:{whatsapp:phone,email:"customer@example.com"}});
   expect(add.statusCode).toBe(201);
   const noCode=await app.inject({method:"POST",url:"/api/auth/vip-invite/register",payload:{inviteCode:invite,email:"customer@example.com",whatsapp:phone,password:"Pass12345!",verificationCode:"000000"}});
   expect(noCode.statusCode).toBe(403);
   const otp=await app.inject({method:"POST",url:"/api/admin/vip-invitations/"+phone+"/code",headers:{authorization:"Bearer "+token},payload:{}});
   expect(otp.statusCode).toBe(200);
   const code=otp.json().code as string;
   expect(code).toMatch(/^\d{6}$/);
   const registered=await app.inject({method:"POST",url:"/api/auth/vip-invite/register",payload:{inviteCode:invite,email:"customer@example.com",whatsapp:phone,password:"Pass12345!",verificationCode:code}});
   expect(registered.statusCode).toBe(201);
   const user=registered.json().user;
   expect(user.plan.slug).toBe("pro-anual");
   expect(user.subscriptionEnd).toBeNull();
   const db=sqliteClient(app.db);
   const row=db.prepare("SELECT used_user_id FROM vip_allowed_phones WHERE phone=?").get(phone) as {used_user_id:string};
   expect(row.used_user_id).toBe(user.id);
   const quota=await app.inject({method:"GET",url:"/api/karaoke-requests/quota",headers:{authorization:"Bearer "+registered.json().accessToken}});
   expect(quota.statusCode).toBe(200);
   expect(quota.json().limit).toBe(15);
   const replay=await app.inject({method:"POST",url:"/api/auth/vip-invite/register",payload:{inviteCode:invite,email:"friend@example.com",whatsapp:phone,password:"Pass12345!",verificationCode:code}});
   expect(replay.statusCode).toBe(409);
 });
 it("does not expose unpublished collection contents", async () => {
   const prepared=await app.inject({method:"GET",url:"/api/public/collections"});
   expect(prepared.statusCode).toBe(200);
   const inactive=prepared.json().find((c:{title:string})=>c.title==="Colección Inactiva");
   expect(inactive).toMatchObject({preparing:true,karaokeCount:0});
   const detail=await app.inject({method:"GET",url:"/api/public/collections/"+inactive.id});
   expect(detail.statusCode).toBe(404);
 });
 it("publishes a prepared collection and blocks it again on unpublish", async () => {
   const list=await app.inject({method:"GET",url:"/api/public/collections"});
   const c=list.json().find((x:{title:string})=>x.title==="Colección Inactiva");
   expect(c.preparing).toBe(true);
   const goLive=await app.inject({method:"PATCH",url:"/api/admin/collections/"+c.id,headers:{authorization:"Bearer "+token},payload:{active:true}});
   expect(goLive.statusCode).toBe(200);
   const detail=await app.inject({method:"GET",url:"/api/public/collections/"+c.id});
   expect(detail.statusCode).toBe(200);
   const status=await app.inject({method:"GET",url:"/api/public/collections"});
   expect(status.json().find((x:{id:string})=>x.id===c.id).preparing).toBe(false);
   const unpublish=await app.inject({method:"PATCH",url:"/api/admin/collections/"+c.id,headers:{authorization:"Bearer "+token},payload:{active:false}});
   expect(unpublish.statusCode).toBe(200);
   const denied=await app.inject({method:"GET",url:"/api/public/collections/"+c.id});
   expect(denied.statusCode).toBe(404);
 });
 it("keeps offers separate from technical membership limits", async () => {
   const edit=await app.inject({method:"PATCH",url:"/api/admin/plan-offers/pro-anual",headers:{authorization:"Bearer "+token},payload:{title:"VIP Anual",price:"189.99",description:"Todas nuestras Actualizaciones VIP",items:["Acceso Carpeta VIP 2026 - 2012"],annualBonus:"15 karaokes gratis al mes"}});
   expect(edit.statusCode).toBe(200);
   const publicOffers=await app.inject({method:"GET",url:"/api/public/plan-offers"});
   expect(publicOffers.statusCode).toBe(200);
   expect(publicOffers.json().find((o:{slug:string})=>o.slug==="pro-anual").price).toBe("189.99");
 });
});
