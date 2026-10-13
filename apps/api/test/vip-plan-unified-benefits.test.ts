import { beforeAll, afterAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildTestApp, TEST_PASSWORD } from "./testApp.js";
import { sqliteClient } from "../src/db/client.js";
import { freeRequestsBullet } from "../src/services/planOffers.js";
import { createVipInviteMessage } from "../src/services/vipInviteMessage.js";

describe("Unified VIP plan configuration", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let memberToken: string;
  const auth = (token:string)=>({authorization:"Bearer "+token});
  beforeAll(async()=>{
    ({app}=await buildTestApp());
    app.env.VIP_MIGRATION_INVITE_CODE="shared-invite-for-unit-test";
    const admin=await app.inject({method:"POST",url:"/api/auth/login",payload:{email:"admin@test.local",password:TEST_PASSWORD}});
    adminToken=admin.json().accessToken;
    const member=await app.inject({method:"POST",url:"/api/auth/login",payload:{email:"active@test.local",password:TEST_PASSWORD}});
    memberToken=member.json().accessToken;
    const db=sqliteClient(app.db);
    const p=db.prepare("SELECT id FROM plans WHERE slug=?").get("pro-anual") as {id:string};
    db.prepare("UPDATE users SET plan_id=?,subscription_start=?,subscription_end=? WHERE email=?").run(
      p.id,Math.floor(Date.now()/1000)-3600,Math.floor(Date.now()/1000)+365*86400,"active@test.local");
  });
  afterAll(async()=>{await app.close()});
  it("generates grammatically correct benefits",()=>{
    expect(freeRequestsBullet(1)).toBe("1 karaoke a pedido GRATIS cada mes");
    expect(freeRequestsBullet(5)).toBe("5 karaokes a pedido GRATIS cada mes");
  });
  it("editing the admin quota immediately changes public offer and real client quota",async()=>{
    const edit=await app.inject({method:"PATCH",url:"/api/admin/plan-offers/pro-anual",headers:auth(adminToken),payload:{
      title:"VIP ANUAL",price:"189.99",description:"Actualizaciones exclusivas",
      items:["Acceso Carpeta VIP 2026 - 2012","15 karaokes a pedido GRATIS cada mes","Otra ventaja"],
      annualBonus:"¡Hasta 180 karaokes a pedido GRATIS durante tu año VIP!",freeRequestsPerMonth:7
    }});
    expect(edit.statusCode).toBe(200);
    expect(edit.json().freeRequestsPerMonth).toBe(7);
    expect(edit.json().items.filter((x:string)=>x.includes("a pedido GRATIS"))).toEqual(["7 karaokes a pedido GRATIS cada mes"]);
    expect(edit.json().annualBonus).toContain("84 karaokes");
    const publicPlans=await app.inject({method:"GET",url:"/api/public/plan-offers"});
    expect(publicPlans.statusCode).toBe(200);
    expect(publicPlans.json().find((o:{slug:string})=>o.slug==="pro-anual").freeRequestsPerMonth).toBe(7);
    const quota=await app.inject({method:"GET",url:"/api/karaoke-requests/quota",headers:auth(memberToken)});
    expect(quota.statusCode).toBe(200);
    expect(quota.json().limit).toBe(7);
  });
  it("new admin changes flow into WhatsApp invitation without regenerating static copy",async()=>{
    const edit=await app.inject({method:"PATCH",url:"/api/admin/plan-offers/pro-anual",headers:auth(adminToken),payload:{
      title:"VIP ANUAL",price:"199.99",description:"Tus actualizaciones",
      items:["Acceso Carpeta VIP 2026 - 2012","7 karaokes a pedido GRATIS cada mes"],
      annualBonus:"¡Hasta 84 karaokes a pedido GRATIS durante tu año VIP!",freeRequestsPerMonth:4
    }});
    expect(edit.statusCode).toBe(200);
    const contact="51944000123";
    expect((await app.inject({method:"POST",url:"/api/admin/vip-invitations",headers:auth(adminToken),payload:{whatsapp:contact}})).statusCode).toBe(201);
    const reply=await app.inject({method:"POST",url:"/api/admin/vip-invitations/"+contact+"/code",headers:auth(adminToken),payload:{}});
    expect(reply.statusCode).toBe(200);
    const message=reply.json().message as string;
    expect(message).toContain("*¡ESTRENAMOS TU NUEVO PANEL VIP DJGABO!*");
    expect(message).toContain("*Solicita 4 karaokes GRATIS cada mes*");
    expect(message).toContain("Ya no enviaremos las actualizaciones por WhatsApp");
    expect(message).toContain("futuras compras");
    expect(message).toContain(reply.json().code);
    expect(message).not.toContain("Solicita 15");
    const link=new URL(reply.json().whatsappUrl);
    expect(link.searchParams.get("text")).toBe(message);
    const quota=await app.inject({method:"GET",url:"/api/karaoke-requests/quota",headers:auth(memberToken)});
    expect(quota.json().limit).toBe(4);
    expect(createVipInviteMessage("https://example.com","123456",{freeRequestsPerMonth:1})).toContain("1 karaoke GRATIS cada mes");
  });
  it("rejects invalid limits without changing live data",async()=>{
    const invalid=await app.inject({method:"PATCH",url:"/api/admin/plan-offers/pro-anual",headers:auth(adminToken),payload:{
      title:"VIP ANUAL",price:"199.99",description:"Actualizaciones",
      items:["Acceso Carpeta VIP 2026 - 2012"],freeRequestsPerMonth:-1
    }});
    expect(invalid.statusCode).toBe(400);
    const plans=await app.inject({method:"GET",url:"/api/public/plan-offers"});
    expect(plans.json().find((o:{slug:string})=>o.slug==="pro-anual").freeRequestsPerMonth).toBe(4);
  });
});
