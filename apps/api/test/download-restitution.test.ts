import {beforeAll,afterAll,describe,it,expect} from "vitest";
import type {FastifyInstance} from "fastify";
import {eq} from "drizzle-orm";
import {buildTestApp,TEST_PASSWORD,type TestFixtures} from "./testApp.js";
import {sqliteClient} from "../src/db/client.js";
import {downloadLogs,collections} from "../src/db/schema.js";
import {createId} from "../src/db/id.js";
import {settleDownloadLog,isChargedDownload} from "../src/services/downloadLedger.js";
import {restoreVerifiedJuneIncident} from "../src/services/restoreVerifiedJuneIncident.js";

describe("Download attempts have trustworthy streaming outcomes and recoverable quotas",()=>{
 let app:FastifyInstance;let f:TestFixtures;let adminAuth:string,memberAuth:string;
 beforeAll(async()=>{
   ({app,fixtures:f}=await buildTestApp());
   const login=async(email:string)=>(await app.inject({method:"POST",url:"/api/auth/login",payload:{email,password:TEST_PASSWORD}})).json().accessToken as string;
   adminAuth="Bearer "+await login("admin@test.local");
   memberAuth="Bearer "+await login("active@test.local");
 });
 afterAll(async()=>{await app.close()});
 it("starts as in-progress, FAILED and INTERRUPTED do not charge, COMPLETE charges once",async()=>{
   const id=createId("dl");
   const now=new Date();
   await app.db.insert(downloadLogs).values({id,userId:f.activeUserId,collectionId:f.collectionAllowedId,type:"COLLECTION_ARCHIVE",status:"IN_PROGRESS",createdAt:now});
   let row=(await app.db.query.downloadLogs.findFirst({where:eq(downloadLogs.id,id)}))!;
   expect(isChargedDownload(row)).toBe(true);
   expect(settleDownloadLog(app.db,id,"FAILED","DROPBOX_500")).toBe(true);
   expect(settleDownloadLog(app.db,id,"COMPLETE")).toBe(false);
   row=(await app.db.query.downloadLogs.findFirst({where:eq(downloadLogs.id,id)}))!;
   expect(isChargedDownload(row)).toBe(false);
   expect(row.errorCode).toBe("DROPBOX_500");
   const status=(await app.inject({method:"GET",url:"/api/downloads/collection/"+f.collectionAllowedId+"/status",headers:{authorization:memberAuth}})).json();
   expect(status.downloadsToday).toBe(0);
 });
 it("Admin can inspect and restore an old charged attempt with audit and no double refund",async()=>{
   const id=createId("dl");
   await app.db.insert(downloadLogs).values({id,userId:f.activeUserId,collectionId:f.collectionAllowedId,type:"COLLECTION_ARCHIVE",status:"LEGACY",createdAt:new Date()});
   const history=await app.inject({method:"GET",url:"/api/admin/clients/"+f.activeUserId+"/download-attempts",headers:{authorization:adminAuth}});
   expect(history.statusCode).toBe(200);
   expect(history.json().items.find((x:{id:string})=>x.id===id).charged).toBe(true);
   const denied=await app.inject({method:"POST",url:"/api/admin/clients/"+f.activeUserId+"/download-attempts/"+id+"/restore",headers:{authorization:memberAuth},payload:{reason:"Fallo confirmado con el ZIP de junio"}});
   expect(denied.statusCode).toBe(403);
   const bad=await app.inject({method:"POST",url:"/api/admin/clients/"+f.activeUserId+"/download-attempts/"+id+"/restore",headers:{authorization:adminAuth},payload:{reason:"ok"}});
   expect(bad.statusCode).toBe(400);
   const before=(await app.inject({method:"GET",url:"/api/downloads/collection/"+f.collectionAllowedId+"/status",headers:{authorization:memberAuth}})).json();
   expect(before.downloadsToday).toBe(1);
   const restored=await app.inject({method:"POST",url:"/api/admin/clients/"+f.activeUserId+"/download-attempts/"+id+"/restore",headers:{authorization:adminAuth},payload:{reason:"ZIP incompleto por error Dropbox 500"}});
   expect(restored.statusCode).toBe(200);
   const after=(await app.inject({method:"GET",url:"/api/downloads/collection/"+f.collectionAllowedId+"/status",headers:{authorization:memberAuth}})).json();
   expect(after.downloadsToday).toBe(0);
   const again=await app.inject({method:"POST",url:"/api/admin/clients/"+f.activeUserId+"/download-attempts/"+id+"/restore",headers:{authorization:adminAuth},payload:{reason:"ZIP incompleto por error Dropbox 500"}});
   expect(again.statusCode).toBe(409);
   const audit=(await app.db.query.downloadLogs.findFirst({where:eq(downloadLogs.id,id)}))!;
   expect(audit.quotaReversedBy).toBe(f.adminId);
   expect(audit.quotaReversalReason).toContain("Dropbox");
   expect(audit.status).toBe("LEGACY");
 });
 it("Restores the exact two June records only when the WhatsApp is already linked to their VIP account",async()=>{
   const juneId=createId("col"),now=new Date();
   await app.db.insert(collections).values({id:juneId,slug:"june-2026-incident",title:"Junio 2026",year:2026,month:6,storagePath:"/2026/06",createdAt:now,updatedAt:now,active:true});
   const sql=sqliteClient(app.db);
   sql.prepare("INSERT INTO vip_allowed_phones(phone,used_user_id,created_at) VALUES(?,?,?)").run("5216123488955",f.activeUserId,Date.now());
   const stamps=["2026-10-13T18:16:50Z","2026-10-13T18:19:12Z"];
   for(const time of stamps){
     await app.db.insert(downloadLogs).values({id:createId("dl"),userId:f.activeUserId,collectionId:juneId,type:"COLLECTION_ARCHIVE",createdAt:new Date(time),status:"LEGACY"});
   }
   restoreVerifiedJuneIncident(app);
   const rows=sql.prepare("SELECT quota_reversed_at,quota_reversed_by FROM download_logs WHERE user_id=? AND collection_id=?").all(f.activeUserId,juneId) as Array<{quota_reversed_at:number|null;quota_reversed_by:string}>;
   expect(rows).toHaveLength(2);
   expect(rows.every(r=>r.quota_reversed_at!==null && r.quota_reversed_by==="AUTOMATIC_VERIFIED_INCIDENT")).toBe(true);
   restoreVerifiedJuneIncident(app);
   const row=sql.prepare("SELECT COUNT(*) as n FROM djgabo_feature_migrations WHERE name LIKE '20261013-incident-june-2026%'").get() as {n:number};
   expect(row.n).toBe(1);
 });
});
