import {afterAll,beforeAll,describe,it,expect} from "vitest";
import {buildTestApp} from "./testApp.js";
import {assets,collections,karaokes} from "../src/db/schema.js";
import {createId} from "../src/db/id.js";
import type {FastifyInstance} from "fastify";

describe("Only masters from the current live provider enter the VIP public catalogue",()=>{
 let app:FastifyInstance;
 let colId:string;
 beforeAll(async()=>{
   ({app}=await buildTestApp()); // mock provider in integration tests
   colId=createId("col");
   const now=new Date();
   await app.db.insert(collections).values({id:colId,slug:"test-catalog-provider",title:"Proveedor",year:2026,month:9,storagePath:"/providers/2026/09",active:true,createdAt:now,updatedAt:now});
   for(const provider of ["mock","dropbox"] as const){
     const assetId=createId("ast");
     await app.db.insert(assets).values({id:assetId,provider,storageKey:"/providers/2026/09/"+provider+".wav",fileName:provider+".wav",mimeType:"audio/wav",size:999,type:"MASTER",createdAt:now});
     await app.db.insert(karaokes).values({id:createId("kar"),collectionId:colId,title:provider+" Song",artist:"Test",code:"CODE-"+provider,identityKey:"ident-"+provider,masterAssetId:assetId,publishedAt:now,createdAt:now});
   }
 });
 afterAll(async()=>{await app.close()});
 it("excludes other-provider records from detail, count and search, while preserving them in DB",async()=>{
   const publicList=(await app.inject({method:"GET",url:"/api/public/collections"})).json();
   expect(publicList.find((x:{id:string})=>x.id===colId).karaokeCount).toBe(1);
   const detail=(await app.inject({method:"GET",url:"/api/public/collections/"+colId})).json();
   expect(detail.karaokes).toHaveLength(1);
   expect(detail.karaokes[0].title).toBe("mock Song");
   const legacy=(await app.inject({method:"GET",url:"/api/public/karaokes/search?q=dropbox%20Song"})).json();
   expect(legacy).toHaveLength(0);
   const real=(await app.inject({method:"GET",url:"/api/public/karaokes/search?q=mock%20Song"})).json();
   expect(real).toHaveLength(1);
   const all=await app.db.query.karaokes.findMany();
   expect(all.filter(k=>k.collectionId===colId)).toHaveLength(2);
 });
});
