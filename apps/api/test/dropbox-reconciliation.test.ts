import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { MockStorageProvider, StorageIndexerService } from "@djgabo/storage";
import { buildTestApp } from "./testApp.js";
import { DrizzleIndexerRepository } from "../src/db/drizzleIndexerRepository.js";
import { collections, karaokes } from "../src/db/schema.js";
import { createId } from "../src/db/id.js";
import type { FastifyInstance } from "fastify";

describe("Dropbox source-of-truth reconciliation, preserving historical references",()=>{
  let app:FastifyInstance;
  let collectionId:string;
  const month="/ACTUALIZACIONES/2026/09_SEPTIEMBRE_2026";
  const file1=month+"/01_Club_Karaoke/ARTISTA - Zaperoko.wav";
  const file2=month+"/01_Club_Karaoke/ARTISTA - Otro.wav";
  const storage=new MockStorageProvider();
  const indexer=()=>new StorageIndexerService(storage,new DrizzleIndexerRepository(app.db,"mock"));
  const items=async()=>app.db.query.karaokes.findMany({where:eq(karaokes.collectionId,collectionId)});
  beforeAll(async()=>{
    ({app}=await buildTestApp());
    collectionId=createId("col");
    const now=new Date();
    await app.db.insert(collections).values({id:collectionId,slug:"test-2026-09",title:"Septiembre 2026",year:2026,month:9,storagePath:month,active:true,createdAt:now,updatedAt:now});
    storage.seedFile(file1,{providerFileId:"id:deleted-test-1",size:1000});
    storage.seedFile(file2,{providerFileId:"id:deleted-test-2",size:1100});
    storage.seedFile(month+"/01_Club_Karaoke/ARTISTA - Otro.cdg",{size:190});
  });
  afterAll(async()=>{await app.close();});
  it("indexes only real masters, not the .cdg sidecars",async()=>{
    const r=await indexer().runMonths([{path:month,year:2026,month:9}],{dryRun:false});
    expect(r.errorCount).toBe(0);expect(r.removedCount).toBe(0);
    expect((await items()).length).toBe(2);
    await app.catalogJsonService.publishMonths([{year:2026,month:9}]);
    const doc=await app.catalogJsonService.readMonth(2026,9);
    expect(doc.doc.karaokes.length).toBe(0); // JSON only includes Dropbox-provider assets, not mock
  });
  it("ignores dry-run and does not delete records when Dropbox listing fails",async()=>{
    // A move outside this month simulates the old file no longer being listed there.
    storage.moveFile(file1,"/ACTUALIZACIONES/2026/10_OCTUBRE_2026/01_Club_Karaoke/ARTISTA - Zaperoko.wav");
    const dry=await indexer().runMonths([{path:month,year:2026,month:9}],{dryRun:true});
    expect(dry.dryRun).toBe(true);
    expect((await items()).every(x=>x.catalogActive)).toBe(true);
    const original=storage.listFolder.bind(storage);
    storage.listFolder=async()=>{throw new Error("Dropbox list_folder timeout");};
    await expect(indexer().runMonths([{path:month,year:2026,month:9}],{dryRun:false})).rejects.toThrow("timeout");
    expect((await items()).every(x=>x.catalogActive)).toBe(true);
    storage.listFolder=original;
  });
  it("retires only missing karaoke and keeps its DB row, IDs and metadata",async()=>{
    const r=await indexer().runMonths([{path:month,year:2026,month:9}],{dryRun:false});
    expect(r.errorCount).toBe(0);expect(r.removedCount).toBe(1);
    const all=await items();
    expect(all.length).toBe(2);
    expect(all.find(x=>x.title.toLowerCase().includes("zaperoko"))?.catalogActive).toBe(false);
    expect(all.find(x=>x.title.toLowerCase().includes("otro"))?.catalogActive).toBe(true);
    const response=await app.inject({method:"GET",url:"/api/public/collections/"+collectionId});
    expect(response.statusCode).toBe(200);
    expect(response.json().karaokes).toHaveLength(1);
    const search=await app.inject({method:"GET",url:"/api/public/karaokes/search?q=Zaperoko"});
    expect(search.statusCode).toBe(200);
    expect(search.json()).toHaveLength(0);
    const summary=await app.inject({method:"GET",url:"/api/public/collections"});
    expect(summary.json().find((x:{id:string})=>x.id===collectionId).karaokeCount).toBe(1);
  });
  it("restores same file identity after reupload or move back",async()=>{
    storage.moveFile("/ACTUALIZACIONES/2026/10_OCTUBRE_2026/01_Club_Karaoke/ARTISTA - Zaperoko.wav",file1);
    const r=await indexer().runMonths([{path:month,year:2026,month:9}],{dryRun:false});
    expect(r.removedCount).toBe(0);
    const all=await items();expect(all).toHaveLength(2);
    expect(all.every(x=>x.catalogActive)).toBe(true);
    const collection=await app.inject({method:"GET",url:"/api/public/collections/"+collectionId});
    expect(collection.json().karaokes).toHaveLength(2);
  });
});
