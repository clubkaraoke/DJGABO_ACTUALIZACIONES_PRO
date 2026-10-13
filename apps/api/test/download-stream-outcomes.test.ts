import {afterAll,beforeAll,describe,expect,it} from "vitest";
import type {FastifyInstance} from "fastify";
import type {ServerResponse} from "node:http";
import {EventEmitter} from "node:events";
import {PassThrough} from "node:stream";
import {eq} from "drizzle-orm";
import {buildTestApp,type TestFixtures} from "./testApp.js";
import {downloadLogs} from "../src/db/schema.js";
import {createId} from "../src/db/id.js";
import {isChargedDownload,trackStreamingOutcome} from "../src/services/downloadLedger.js";

describe("ZIP stream outcome tracking",()=>{
 let app:FastifyInstance;let f:TestFixtures;
 beforeAll(async()=>{({app,fixtures:f}=await buildTestApp())});
 afterAll(async()=>{await app.close()});
 async function setup(){
   const id=createId("dl");
   await app.db.insert(downloadLogs).values({id,userId:f.activeUserId,collectionId:f.collectionAllowedId,type:"COLLECTION_ARCHIVE",status:"IN_PROGRESS",createdAt:new Date()});
   const raw=new EventEmitter() as EventEmitter & {writableFinished:boolean};
   raw.writableFinished=false;
   const stream=new PassThrough();
   trackStreamingOutcome(app,{raw:raw as unknown as ServerResponse},stream,id);
   return {id,raw,stream,read:async()=>(await app.db.query.downloadLogs.findFirst({where:eq(downloadLogs.id,id)}))!};
 }
 it("marks a Dropbox 500 error as FAILED and removes the charge",async()=>{
   const x=await setup();
   x.stream.emit("error",new Error("Error Dropbox 500"));
   expect((await x.read()).status).toBe("FAILED");
   expect((await x.read()).errorCode).toContain("Dropbox 500");
   expect(isChargedDownload(await x.read())).toBe(false);
   x.raw.emit("finish"); // late finish must not overwrite failure
   expect((await x.read()).status).toBe("FAILED");
 });
 it("marks a premature proxy/client close as INTERRUPTED and uncharges",async()=>{
   const x=await setup();
   x.raw.emit("close");
   expect((await x.read()).status).toBe("INTERRUPTED");
   expect(isChargedDownload(await x.read())).toBe(false);
 });
 it("charges when the server finishes transmitting the complete stream",async()=>{
   const x=await setup();
   x.raw.writableFinished=true;
   x.raw.emit("finish");
   expect((await x.read()).status).toBe("COMPLETE");
   expect(isChargedDownload(await x.read())).toBe(true);
   x.raw.emit("close");
   expect((await x.read()).status).toBe("COMPLETE");
 });
});
