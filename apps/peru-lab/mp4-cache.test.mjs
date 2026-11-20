import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {videoCache} from './mp4-cache-server.mjs';
import {cacheRoutes} from './mp4-cache-worker.mjs';
const shop='https://djgabo-tienda-peru-lab-production.up.railway.app',origin='https://worker.example',secret='test-secret'.repeat(5),id='PE-'+'a'.repeat(24),files=new Map(),uploads=new Map();
const bucket={async head(k){return files.has(k)?{size:files.get(k).length}:null},async createMultipartUpload(k){const uploadId='upload-'+uploads.size;uploads.set(uploadId,{k,parts:new Map()});return{uploadId}},resumeMultipartUpload(k,u){const x=uploads.get(u);assert.equal(x.k,k);return{async uploadPart(n,b){x.parts.set(n,new Uint8Array(b));return{partNumber:n,etag:'etag'+n}},async complete(parts){assert.equal(parts.length,x.parts.size);const b=Buffer.concat(parts.map(p=>x.parts.get(p.partNumber)));files.set(k,b);return{size:b.length}}}},async get(k,{range}={}){const b=files.get(k);return b?{body:range?b.subarray(range.offset,range.offset+range.length):b}:null},async delete(k){files.delete(k)}};
const env={MP4:bucket,DELIVERY_SECRET:secret};let rev='a';const t={track_id:id,artist:'Artista',title:'Canción',audio:'a.wav',cdg:'b.cdg'};
const handle=videoCache({db:new DatabaseSync(':memory:'),send:(res,status,body)=>Object.assign(res,{status,body}),readJson:async r=>r.body,requireUser:r=>{if(!r.user)throw Error('LOGIN');return r.user},csrf:r=>{if(r.csrf!==true)throw Error('CSRF')},owned:(u,i)=>i===id&&['alice','bob'].includes(u)?t:null,admin:r=>{if(!r.isAdmin)throw Error('ADMIN')},sourceRevision:async p=>p+rev,deliveryOrigin:origin,deliverySecret:secret});
const old=globalThis.fetch;globalThis.fetch=(u,i)=>cacheRoutes(new Request(u,i),env);
const p='/api/my-karaokes/'+id+'/video/cache',api=async(body,user='alice',path=p,method='POST',isAdmin=false)=>{const res={};assert.equal(await handle({body,user,csrf:true,isAdmin},res,path,method),true);return res.body};
try{
 assert.equal((await cacheRoutes(new Request(origin+'/cache/download'),env)).status,403);
 await assert.rejects(api({action:'lookup'},'eve'),/PURCHASE_REQUIRED/);
 const a=await api({action:'lookup'});assert.equal(a.status,'missing');
 const bytes=Buffer.alloc(16*1024*1024+12000);bytes.write('ftyp',4);
 const offer=await api({action:'offer',version:a.version,size:bytes.length});assert.equal(offer.status,'upload');assert.equal((await api({action:'offer',version:a.version,size:bytes.length},'bob')).status,'uploading');
 const parts=[];for(let i=0,n=1;i<bytes.length;i+=offer.partSize,n++){const body=bytes.subarray(i,i+offer.partSize),u=new URL(offer.url);u.searchParams.set('part',n);const r=await fetch(u,{method:'PUT',headers:{Origin:shop,'Content-Length':String(body.length)},body});assert.equal(r.status,200);parts.push(await r.json())}
 assert.equal((await fetch(offer.url,{method:'POST',headers:{Origin:shop,'Content-Type':'application/json'},body:JSON.stringify({parts})})).status,200);
 assert.equal((await api({action:'finish',version:a.version,nonce:offer.nonce})).status,'pending');assert.equal((await api({action:'lookup'},'bob')).status,'pending');
 const review='/api/admin/video-cache/'+id+'/'+a.version;await assert.rejects(api({action:'approve'},'alice',review,'POST',true),/REVIEW_REQUIRED/);await assert.rejects(api({action:'approve',confirmed:true},'alice',review),/ADMIN/);
 assert.equal((await api({action:'approve',confirmed:true},'alice',review,'POST',true)).status,'approved');const b=await api({action:'lookup'},'bob');assert.equal(b.status,'ready');const down=await fetch(b.url,{headers:{Range:'bytes=0-19'}});assert.equal(down.status,206);assert.deepEqual(Buffer.from(await down.arrayBuffer()),bytes.subarray(0,20));
 rev='b';const changed=await api({action:'lookup'},'bob');assert.equal(changed.status,'missing');assert.notEqual(changed.version,a.version);assert.equal(files.size,1);console.log('PASS: purchase, single claim, multipart, admin approval, signed reuse, range, revision invalidation');
}finally{globalThis.fetch=old}
