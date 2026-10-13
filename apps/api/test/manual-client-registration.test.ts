import { beforeAll,afterAll,describe,it,expect } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildTestApp } from "./testApp.js";
import { sqliteClient } from "../src/db/client.js";

describe("Admin creates paid VIP customers safely",()=>{
 let app:FastifyInstance,auth:string;
 const payload=(email:string,phone:string,planSlug="pro-anual")=>({
   name:"Comprador VIP",email,whatsapp:phone,planSlug,
   paymentMethod:"YAPE_PLIN",amountPaid:"720.00",paymentCurrency:"PEN",
   paymentReference:"YAPE-TEST-123",paymentConfirmed:true
 });
 beforeAll(async()=>{
   ({app}=await buildTestApp());
   const res=await app.inject({method:"POST",url:"/api/auth/login",payload:{email:"admin@test.local",password:"Test1234!"}});
   expect(res.statusCode).toBe(200);auth="Bearer "+res.json().accessToken;
 });
 afterAll(async()=>{await app.close()});
 it("rejects creating customers without admin access and payment confirmation",async()=>{
   const unauth=await app.inject({method:"POST",url:"/api/admin/clients/manual",payload:payload("first@x.com","51988822111")});
   expect(unauth.statusCode).toBe(401);
   const unpaid=await app.inject({method:"POST",url:"/api/admin/clients/manual",headers:{authorization:auth},payload:{...payload("first@x.com","51988822111"),paymentConfirmed:false}});
   expect(unpaid.statusCode).toBe(400);
 });
 it("creates a 12-month paying user, records currency and issues token only once",async()=>{
   const res=await app.inject({method:"POST",url:"/api/admin/clients/manual",headers:{authorization:auth},payload:payload("buyer1@example.com","+51 988 822 111")});
   expect(res.statusCode).toBe(201);
   const out=res.json();
   expect(out.whatsapp).toBe("51988822111");
   expect(out.activationUrl).toMatch(/\/activar-cuenta#token=[a-f0-9]{64}$/);
   expect(out.message).toContain("Tu pago fue confirmado");
   expect(new Date(out.subscriptionEnd).getTime()-new Date(out.subscriptionStart).getTime()).toBeGreaterThan(360*86400_000);
   const sql=sqliteClient(app.db);
   const row=sql.prepare("SELECT * FROM manual_customer_accounts WHERE user_id=?").get(out.id) as {setup_hash:string;phone:string;setup_consumed:number|null};
   expect(row.phone).toBe("51988822111");expect(row.setup_hash).not.toBe(out.activationUrl.split("=")[1]);
   const payment=sql.prepare("SELECT * FROM manual_customer_payments WHERE user_id=?").get(out.id) as {amount_paid:string;payment_currency:string;payment_method:string;plan_price_usd:string};
   expect(payment.amount_paid).toBe("720.00");
   expect(payment.payment_currency).toBe("PEN");
   expect(payment.plan_price_usd).toBe("189.99");
   const customer=await app.inject({method:"GET",url:"/api/admin/clients/"+out.id,headers:{authorization:auth}});
   expect(customer.json().manualAccountStatus).toBe("PENDING_PASSWORD");
   expect(customer.json().whatsapp).toBe("51988822111");
   const token=out.activationUrl.split("=")[1];
   const pass=await app.inject({method:"POST",url:"/api/auth/activate-manual-client",payload:{token,password:"VeryGoodTest!234"}});
   expect(pass.statusCode).toBe(200);
   const replay=await app.inject({method:"POST",url:"/api/auth/activate-manual-client",payload:{token,password:"AnotherPassword!234"}});
   expect(replay.statusCode).toBe(410);
   const login=await app.inject({method:"POST",url:"/api/auth/login",payload:{email:"buyer1@example.com",password:"VeryGoodTest!234"}});
   expect(login.statusCode).toBe(200);
   expect(login.json().user.plan.slug).toBe("pro-anual");
   const again=await app.inject({method:"POST",url:"/api/admin/clients/"+out.id+"/activation-link",headers:{authorization:auth},payload:{}});
   expect(again.statusCode).toBe(409);
   const duplicate=await app.inject({method:"POST",url:"/api/admin/clients/manual",headers:{authorization:auth},payload:payload("buyer2@example.com","51988822111")});
   expect(duplicate.statusCode).toBe(409);
   const duplicateEmail=await app.inject({method:"POST",url:"/api/admin/clients/manual",headers:{authorization:auth},payload:payload("buyer1@example.com","51911155555")});
   expect(duplicateEmail.statusCode).toBe(409);
 });
 it("allows regenerating expired setup links, invalidates previous link",async()=>{
   const res=await app.inject({method:"POST",url:"/api/admin/clients/manual",headers:{authorization:auth},payload:payload("buyer3@example.com","51977445511","pro-mensual")});
   expect(res.statusCode).toBe(201);
   const old=res.json().activationUrl.split("=")[1],id=res.json().id;
   const regenerated=await app.inject({method:"POST",url:"/api/admin/clients/"+id+"/activation-link",headers:{authorization:auth},payload:{}});
   expect(regenerated.statusCode).toBe(200);
   const next=regenerated.json().activationUrl.split("=")[1];
   expect(next).not.toBe(old);
   expect((await app.inject({method:"POST",url:"/api/auth/activate-manual-client",payload:{token:old,password:"Test1234!5678"}})).statusCode).toBe(410);
   expect((await app.inject({method:"POST",url:"/api/auth/activate-manual-client",payload:{token:next,password:"Test1234!5678"}})).statusCode).toBe(200);
   const duration=new Date(res.json().subscriptionEnd).getTime()-new Date(res.json().subscriptionStart).getTime();
   expect(duration).toBe(30*86400_000);
 });
 it("calculates six-month term and keeps old VIP numbers reserved",async()=>{
   const six=await app.inject({method:"POST",url:"/api/admin/clients/manual",headers:{authorization:auth},payload:payload("buyer4@example.com","51977445522","pro-semestral")});
   expect(six.statusCode).toBe(201);
   const months=new Date(six.json().subscriptionEnd).getTime()-new Date(six.json().subscriptionStart).getTime();
   expect(months).toBeGreaterThan(175*86400_000);expect(months).toBeLessThan(190*86400_000);
   sqliteClient(app.db).prepare("INSERT INTO vip_allowed_phones(phone,created_at) VALUES(?,?)").run("51977114422",Date.now());
   const reserved=await app.inject({method:"POST",url:"/api/admin/clients/manual",headers:{authorization:auth},payload:payload("buyer5@example.com","51977114422")});
   expect(reserved.statusCode).toBe(409);
 });
});
