import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const manifest=JSON.parse(fs.readFileSync('apps/peru-lab/demo-pilot-manifest.json','utf8'));
const shop='https://djgabo-tienda-peru-lab-production.up.railway.app';
const deployed=process.argv.includes('--shop');
const sha=b=>createHash('sha256').update(b).digest('hex');
async function request(url,opts={},status=200){
 const r=await fetch(url,{...opts,signal:AbortSignal.timeout(20000)});
 assert.equal(r.status,status,url);return r;
}
let bytes=0;
for(const [id,d] of Object.entries(manifest.items)){
 const base=manifest.origin+'/peru/'+id+'/'+d.version;
 if(deployed){
  const c=await(await request(shop+'/api/preview/cdg/'+id+'/config')).json();
  assert.equal(c.mediaSource,'r2');assert.equal(c.audioUrl,base+'/audio.mp3');assert.equal(c.cdgUrl,base+'/graphics.cdg');assert.equal(c.durationSeconds,60);assert.equal(c.sourceStartSeconds,35);
  assert.ok(c.fallbackAudioUrl.startsWith('/api/preview/'));
  const legacy=await(await request(shop+'/api/preview/cdg/'+id+'/config?legacy=1')).json();assert.equal(legacy.mediaSource,'railway');
 }
 for(const [file,n,hash] of [['audio.mp3',d.audioBytes,d.audioHash],['graphics.cdg',d.cdgBytes,d.cdgHash]]){
  const url=base+'/'+file;
  const t=Date.now(),r=await request(url,{headers:{Origin:shop}});
  assert.equal(r.headers.get('X-DJGABO-Demo'),'r2');assert.equal(r.headers.get('access-control-allow-origin'),'*');
  const b=Buffer.from(await r.arrayBuffer());assert.equal(b.length,n);assert.equal(sha(b),hash);
  const h=await request(url,{method:'HEAD'});assert.equal(Number(h.headers.get('content-length')),n);
  const range=await request(url,{headers:{Range:'bytes=0-127',Origin:shop}},206);
  assert.equal(range.headers.get('content-range'),'bytes 0-127/'+n);
  assert.deepEqual(Buffer.from(await range.arrayBuffer()),b.subarray(0,128));bytes+=n;
  console.log('PASS',id,file,n,'ms',Date.now()-t);
 }
}
const [id,d]=Object.entries(manifest.items)[0];
const base=manifest.origin+'/peru/'+id+'/'+d.version;
await request(base+'/audio.mp3',{method:'PUT'},405);
await request(base+'/audio.mp3',{headers:{Range:'bytes=999999999-'}},416);
await request(base+'/original.wav',{},404);
await request(manifest.origin+'/peru/'+id+'/'+('0'.repeat(24))+'/audio.mp3',{},404);
await request(manifest.origin+'/peru',{},404);
if(deployed){
 const catalog=await(await request(shop+'/api/catalog/peru/index.json')).json();
 const t=catalog.tracks.find(t=>!manifest.items[t.id]&&['WAV+CDG','MP3+CDG'].includes(t.format));
 const c=await(await request(shop+'/api/preview/cdg/'+t.id+'/config')).json();assert.equal(c.mediaSource,'railway');
 await request(shop+'/api/my-karaokes',{},401);
}
console.log('PASS ALL',Object.keys(manifest.items).length,'DEMOS',bytes,'BYTES',deployed?'SHOP INTEGRATED':'WORKER');
