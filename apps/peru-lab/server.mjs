import http from 'node:http';

import {commerce} from './commerce.mjs';
import {readFile, mkdir} from 'node:fs/promises';
import {createHmac, createHash, createSign, timingSafeEqual} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {spawn} from 'node:child_process';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import path from 'node:path';
const data=process.env.DATA_DIR||'/data';
await mkdir(data,{recursive:true});
const db=new DatabaseSync(path.join(data,'peru.sqlite'));
db.exec("PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS tracks(id TEXT PRIMARY KEY, artist TEXT NOT NULL,title TEXT NOT NULL,cover TEXT,format TEXT NOT NULL,audio TEXT NOT NULL,cdg TEXT NOT NULL,position INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT);");

// Datos comerciales exclusivos de la LAB. Los importes se guardan en céntimos.
const adminSecret=process.env.PERU_LAB_ADMIN_PASSWORD||'';
const paymentCodes=['yape','plin','transferencia','tarjeta','paypal'];
const defaults={unitPriceCents:1500,promotions:[],offer:{enabled:false,title:'',discountPercent:0},paymentMethods:Object.fromEntries(paymentCodes.map(k=>[k,false]))};
const settingsKey='storeSettings';
db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING').run(settingsKey,JSON.stringify(defaults));
function settings(){return JSON.parse(db.prepare('SELECT value FROM meta WHERE key=?').get(settingsKey).value)}
function cleanSettings(v){
  const validPrice=n=>Number.isSafeInteger(n)&&n>=1&&n<=10000000;
  if(!v||!validPrice(v.unitPriceCents)||!Array.isArray(v.promotions)||v.promotions.length>20)throw Error('INVALID_SETTINGS');
  const minSet=new Set();
  const promotions=v.promotions.map(t=>{if(!Number.isSafeInteger(t.minQty)||t.minQty<2||t.minQty>500||!validPrice(t.unitPriceCents)||t.unitPriceCents>v.unitPriceCents||minSet.has(t.minQty)||typeof t.enabled!=='boolean')throw Error('INVALID_PROMOTION');minSet.add(t.minQty);return {minQty:t.minQty,unitPriceCents:t.unitPriceCents,enabled:t.enabled}}).sort((a,b)=>a.minQty-b.minQty);
  const o=v.offer;if(!o||typeof o.enabled!=='boolean'||typeof o.title!=='string'||o.title.length>120||!Number.isInteger(o.discountPercent)||o.discountPercent<0||o.discountPercent>99||(o.enabled&&(!o.title.trim()||o.discountPercent<1)))throw Error('INVALID_OFFER');
  const paymentMethods=Object.fromEntries(paymentCodes.map(k=>[k,v.paymentMethods?.[k]===true]));
  return {unitPriceCents:v.unitPriceCents,promotions,offer:{enabled:o.enabled,title:o.title.trim(),discountPercent:o.discountPercent},paymentMethods};
}
function quoteCart(ids){
  if(!Array.isArray(ids)||ids.length>500||ids.some(id=>typeof id!=='string'||!/^PE-[a-f0-9]{24}$/.test(id)))throw Error('INVALID_CART');
  const unique=[...new Set(ids)],get=db.prepare('SELECT id FROM tracks WHERE id=?');
  if(unique.some(id=>!get.get(id)))throw Error('CART_ITEM_UNAVAILABLE');
  const cfg=settings(),qty=unique.length,subtotalCents=qty*cfg.unitPriceCents;
  let price=cfg.unitPriceCents,applied=null;
  for(const tier of cfg.promotions){if(tier.enabled&&qty>=tier.minQty&&tier.unitPriceCents<price){price=tier.unitPriceCents;applied='Promoción desde '+tier.minQty+' karaokes'}}
  if(cfg.offer.enabled&&qty){const special=Math.max(1,Math.round(cfg.unitPriceCents*(100-cfg.offer.discountPercent)/100));if(special<price){price=special;applied=cfg.offer.title}}
  const totalCents=qty*price;
  return {currency:'PEN',qty,unitPriceCents:price,subtotalCents,discountCents:subtotalCents-totalCents,totalCents,applied,paymentMethods:cfg.paymentMethods,checkoutEnabled:false};
}

const demoPilot=JSON.parse(await readFile(new URL('./demo-pilot-manifest.json',import.meta.url),'utf8'));
const demoPublishSecret=process.env.PERU_DEMO_PUBLISH_SECRET||'';
db.exec('CREATE TABLE IF NOT EXISTS demo_cache(id TEXT PRIMARY KEY,version TEXT NOT NULL,revision TEXT,checked_at INTEGER NOT NULL)');
const readDemoCache=db.prepare('SELECT * FROM demo_cache WHERE id=?');
const writeDemoCache=db.prepare('INSERT INTO demo_cache(id,version,revision,checked_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET version=excluded.version,revision=excluded.revision,checked_at=excluded.checked_at');
const demoPending=new Map();
const REVISION_TTL=12*60*60*1000;
const BRAND='DJGABO / CLUB KARAOKE', SHEET='1ww6Fe20Bhe0SLhnHv8nEITK8SYQIpFmjNhi4LKXmylk';
const secret=process.env.PERU_LAB_SYNC_TOKEN||'';
const demoSecret=process.env.PERU_LAB_DEMO_SECRET||'';
const viewerPassword=process.env.PERU_LAB_VIEWER_PASSWORD||'';
if(secret.length<32||demoSecret.length<32)throw Error('LAB secrets missing');
const norm=v=>String(v??'').trim();
const safeEq=(a,b)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y)};
const mediaPath=(v,ext)=>{const s=norm(v);return /^(?:ns:\d+\/|\/)[^\r\n]+$/.test(s)&&ext.test(s)&&!s.split('/').includes('..')?s:''};
function prepare(rows){
  if(!Array.isArray(rows)||rows.length<2||rows.length>30000)throw Error('INVALID_SHEET');
  const headers=['NOMBRE ARTISTA','TITULO CANCION','MARCA','COVER','AUDIO','CDG','ZIP','DEMO','ID_CANCION'];
  if(!headers.every((h,i)=>norm(rows[0]?.[i]).toUpperCase()===h))throw Error('INVALID_HEADERS');
  const mapped=[];
  for(let i=1;i<rows.length;i++){
    const [artist,title,brand,cover,audio,cdg,,,code]=rows[i].map(norm);
    if(brand?.toUpperCase()!==BRAND||!artist||!title)continue;
    const a=mediaPath(audio,/\.(mp3|wav)$/i),c=mediaPath(cdg,/\.cdg$/i)||(a?a.replace(/\.(mp3|wav)$/i,'.cdg'):'');
    const id='PE-'+createHash('sha256').update((code||'')+'\0'+artist+'\0'+title+'\0'+a+'\0'+c).digest('hex').slice(0,24);
    const image=/^https:\/\/[^\s]+$/i.test(cover||'')?cover:null;
    mapped.push({id,artist,title,cover:image,format:a?a.toLowerCase().endsWith('.wav')?'WAV+CDG':'MP3+CDG':'MP3/WAV+CDG',audio:a,cdg:c,position:i});
  }
  if(!mapped.length)throw Error('EMPTY_CATALOG');
  return mapped;
}
let syncing=false;
function publish(rows){
  const prepared=prepare(rows); const count=db.prepare('SELECT count(*) AS n FROM tracks').get().n;
  if(count&&prepared.length<count*0.8)throw Error('CATALOG_SHRANK; kept previous');
  const insert=db.prepare('INSERT INTO tracks VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET artist=excluded.artist,title=excluded.title,cover=excluded.cover,format=excluded.format,audio=excluded.audio,cdg=excluded.cdg,position=excluded.position');
  db.exec('BEGIN IMMEDIATE');
  try{ db.exec('DELETE FROM tracks'); for(const t of prepared)insert.run(t.id,t.artist,t.title,t.cover,t.format,t.audio,t.cdg,t.position);db.prepare("INSERT INTO meta VALUES('lastSync',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(new Date().toISOString());db.exec('COMMIT');}
  catch(e){db.exec('ROLLBACK');throw e}
  return db.prepare('SELECT count(*) AS n FROM tracks').get().n;
}
async function googleRows(){
  const email=process.env.GOOGLE_SHEETS_CLIENT_EMAIL, key=process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g,'\n');
  if(!email||!key)throw Error('GOOGLE_AUTH_REQUIRED');
  const now=Math.floor(Date.now()/1000);
  const part=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
  const body=part({alg:'RS256',typ:'JWT'})+'.'+part({iss:email,scope:'https://www.googleapis.com/auth/spreadsheets.readonly',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
  const signature=createSign('RSA-SHA256').update(body).sign(key).toString('base64url');
  const token=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:body+'.'+signature}),signal:AbortSignal.timeout(20000)});
  if(!token.ok)throw Error('GOOGLE_AUTH_FAILED');
  const {access_token}=await token.json();
  const result=await fetch('https://sheets.googleapis.com/v4/spreadsheets/'+SHEET+'/values/'+encodeURIComponent('MAESTRO!A1:I')+'?valueRenderOption=UNFORMATTED_VALUE',{headers:{Authorization:'Bearer '+access_token},signal:AbortSignal.timeout(30000)});
  if(!result.ok)throw Error('GOOGLE_READ_FAILED');
  return (await result.json()).values;
}
async function autoSync(){if(syncing||!process.env.GOOGLE_SHEETS_CLIENT_EMAIL||!process.env.GOOGLE_SHEETS_PRIVATE_KEY)return;syncing=true;try{console.log('PERU_SYNC',publish(await googleRows()))}catch(e){console.warn('PERU_SYNC_FAILED',e.message)}finally{syncing=false}}
void autoSync();setInterval(autoSync,300000).unref();
let dropboxToken=null,dropboxExpires=0;
async function getDropboxToken(){
  if(dropboxToken&&Date.now()<dropboxExpires)return dropboxToken;
  const {DROPBOX_APP_KEY:key,DROPBOX_APP_SECRET:secret,DROPBOX_REFRESH_TOKEN:refresh}=process.env;
  if(!key||!secret||!refresh)throw Error('DROPBOX_UNCONFIGURED');
  const r=await fetch('https://api.dropboxapi.com/oauth2/token',{method:'POST',body:new URLSearchParams({grant_type:'refresh_token',refresh_token:refresh,client_id:key,client_secret:secret}),signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Error('DROPBOX_AUTH_FAILED');const j=await r.json();dropboxToken=j.access_token;dropboxExpires=Date.now()+(Number(j.expires_in)-60)*1000;return dropboxToken;
}
const headerJson=v=>JSON.stringify(v).replace(/[\u007f-\uffff]/g,ch=>'\\u'+ch.charCodeAt(0).toString(16).padStart(4,'0'));
async function dropboxOpen(storagePath){
  const m=/^ns:(\d+)\/+(.+)$/.exec(storagePath);if(!m&&!storagePath.startsWith('/'))throw Error('INVALID_STORAGE_PATH');
  const token=await getDropboxToken();
  const headers={Authorization:'Bearer '+token,'Dropbox-API-Arg':headerJson({path:m?'/'+m[2]:storagePath}),...(m?{'Dropbox-API-Path-Root':headerJson({'.tag':'namespace_id',namespace_id:m[1]})}:{})};
  let resp=await fetch('https://content.dropboxapi.com/2/files/download',{method:'POST',headers,signal:AbortSignal.timeout(60000)});
  if(!resp.ok&&!m&&process.env.PERU_DROPBOX_NAMESPACE){const parts=storagePath.split('/');const idx=parts.findIndex(p=>/^Pack Top Hits PERU/i.test(p));if(idx>=0){await resp.body?.cancel();headers['Dropbox-API-Arg']=headerJson({path:'/'+parts.slice(idx).join('/')});headers['Dropbox-API-Path-Root']=headerJson({'.tag':'namespace_id',namespace_id:process.env.PERU_DROPBOX_NAMESPACE});resp=await fetch('https://content.dropboxapi.com/2/files/download',{method:'POST',headers,signal:AbortSignal.timeout(60000)})}}
  if(!resp.ok||!resp.body){await resp.body?.cancel();throw Error('DROPBOX_CONTENT_'+resp.status)}
  return resp;
}
async function dropboxTemporaryLink(storagePath){
  const m=/^ns:(\d+)\/+(.+)$/.exec(storagePath);if(!m&&!storagePath.startsWith('/'))throw Error('INVALID_STORAGE_PATH');
  const token=await getDropboxToken();
  const ask=async(file,namespace)=>fetch('https://api.dropboxapi.com/2/files/get_temporary_link',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...(namespace?{'Dropbox-API-Path-Root':headerJson({'.tag':'namespace_id',namespace_id:namespace})}:{})},body:JSON.stringify({path:file}),signal:AbortSignal.timeout(15000)});
  let resp=await ask(m?'/'+m[2]:storagePath,m?m[1]:null);
  if(!resp.ok&&!m&&process.env.PERU_DROPBOX_NAMESPACE){const parts=storagePath.split('/');const idx=parts.findIndex(p=>/^Pack Top Hits PERU/i.test(p));if(idx>=0){await resp.body?.cancel();resp=await ask('/'+parts.slice(idx).join('/'),process.env.PERU_DROPBOX_NAMESPACE)}}
  if(!resp.ok){await resp.body?.cancel();throw Error('DROPBOX_LINK_'+resp.status)}
  const {link}=await resp.json();const url=new URL(link);if(url.protocol!=='https:'||url.username||url.password||url.port||!(url.hostname==='dropboxusercontent.com'||url.hostname.endsWith('.dropboxusercontent.com')))throw Error('INVALID_DROPBOX_LINK');return url.href;
}
const expireTicket=id=>{let payload=Buffer.from(JSON.stringify({id,exp:Date.now()+300000})).toString('base64url');return payload+'.'+createHmac('sha256',demoSecret).update(payload).digest('base64url')};
function validTicket(ticket,id){
  try{const [raw,mac,extra]=ticket.split('.');if(extra||!safeEq(mac,createHmac('sha256',demoSecret).update(raw).digest('base64url')))return false;const p=JSON.parse(Buffer.from(raw,'base64url'));return p.id===id&&p.exp>Date.now()}catch{return false}
}
const send=(res,status,value)=>{const body=JSON.stringify(value);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(body)};
const mediaTypes={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.wasm':'application/wasm','.css':'text/css; charset=utf-8'};
async function staticFile(res,file){const b=await readFile(file);res.writeHead(200,{'Content-Type':mediaTypes[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff'});res.end(b)}
async function readJson(req){let chunks=[],bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>10*1024*1024)throw Error('PAYLOAD_TOO_LARGE');chunks.push(chunk)}return JSON.parse(Buffer.concat(chunks).toString('utf8'))}
let audioActive=0;
async function audioDemo(storagePath,onRevision){
  const source=await dropboxOpen(storagePath);
  onRevision?.(downloadRevision(source));
  const proc=spawn('ffmpeg',['-hide_banner','-loglevel','error','-i','pipe:0','-ss','35','-t','60','-vn','-map_metadata','-1','-ac','2','-ar','44100','-c:a','libmp3lame','-b:a','160k','-f','mp3','pipe:1'],{stdio:['pipe','pipe','ignore']});
  const input=Readable.fromWeb(source.body); const output=[];let size=0;
  const timeout=setTimeout(()=>proc.kill('SIGKILL'),60000);
  try {
    const done=new Promise((resolve,reject)=>{proc.once('error',reject);proc.once('close',code=>code===0?resolve():reject(Error('DEMO_FAILED')))});
    proc.stdout.on('data',b=>{size+=b.length;if(size>1500000)proc.kill('SIGKILL');else output.push(b)});
    input.on('error',()=>proc.stdin.destroy());proc.stdin.on('error',()=>input.destroy()); input.pipe(proc.stdin);
    await done;const b=Buffer.concat(output);if(!b.length)throw Error('EMPTY_DEMO');return b;
  }finally{clearTimeout(timeout);input.destroy()}
}
function downloadRevision(source){try{return JSON.parse(source.headers.get('dropbox-api-result')||'{}').rev||null}catch{return null}}
async function cdgDemo(storagePath,onRevision){
  const source=await dropboxOpen(storagePath);onRevision?.(downloadRevision(source));
  const cap=96*300*24,parts=[];let size=0;
  for await(const chunk of Readable.fromWeb(source.body)){const b=chunk.subarray(0,cap-size);parts.push(b);size+=b.length;if(size>=cap)break}
  const data=Buffer.concat(parts);if(!data.length||data.length%24)throw Error('INVALID_CDG_DEMO');return data;
}
async function sourceRevision(storagePath){
  const m=/^ns:(\d+)\/+(.+)$/.exec(storagePath),token=await getDropboxToken();
  const ask=(file,namespace)=>fetch('https://api.dropboxapi.com/2/files/get_metadata',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...(namespace?{'Dropbox-API-Path-Root':headerJson({'.tag':'namespace_id',namespace_id:namespace})}:{})},body:JSON.stringify({path:file}),signal:AbortSignal.timeout(10000)});
  let resp=await ask(m?'/'+m[2]:storagePath,m?m[1]:null);
  if(!resp.ok&&!m&&process.env.PERU_DROPBOX_NAMESPACE){const parts=storagePath.split('/'),idx=parts.findIndex(p=>/^Pack Top Hits PERU/i.test(p));if(idx>=0){await resp.body?.cancel();resp=await ask('/'+parts.slice(idx).join('/'),process.env.PERU_DROPBOX_NAMESPACE)}}
  if(!resp.ok){await resp.body?.cancel();throw Error('DEMO_REVISION_'+resp.status)}
  const metadata=await resp.json();if(!metadata.rev)throw Error('DEMO_REVISION_MISSING');return metadata.rev;
}
const versionFor=(audio,cdg)=>createHash('sha256').update(audio).update(cdg).digest('hex').slice(0,24);
async function publishDemo(id,version,audio,cdg){
  if(demoPilot.items[id]?.version===version)return;
  const base=demoPilot.origin+'/internal/publish/'+id+'/'+version+'/';
  const sendPart=async(file,body)=>{
    const r=await fetch(base+file,{method:'POST',headers:{Authorization:'Bearer '+demoPublishSecret,...(body?{'Content-Type':'application/octet-stream','Content-Length':String(body.length)}:{})},body,signal:AbortSignal.timeout(25000)});
    if(r.status===409&&file!=='ready'){const x=await r.json();if(x.error==='DEMO_IMMUTABLE')return;throw Error('DEMO_UPLOAD_CONFLICT')}
    if(!r.ok){await r.body?.cancel();throw Error('DEMO_UPLOAD_'+r.status)}
    await r.body?.cancel();
  };
  const out=await Promise.allSettled([sendPart('audio.mp3',audio),sendPart('graphics.cdg',cdg)]);
  if(out.some(x=>x.status==='rejected'))throw Error('DEMO_UPLOAD_FAILED');
  await sendPart('ready');
}
async function resolveDemo(t){
  const id=t.id,existing=readDemoCache.get(id),pilot=demoPilot.items[id];
  if(!demoPublishSecret)return pilot?{version:pilot.version,status:'pilot'}:null;
  if(existing&&Date.now()-existing.checked_at<REVISION_TTL)return {version:existing.version,status:'hit'};
  if(demoPending.has(id)){const r=await demoPending.get(id);return r?{...r,status:'shared'}:null}
  // At most two distinct first-time jobs, sharing the same limit as legacy FFmpeg.
  if(demoPending.size>=2||audioActive>=2){if(existing||pilot)return {version:existing?.version||pilot.version,status:'hit'};throw Error('DEMOS_BUSY')}
  const work=(async()=>{
    const current=existing||pilot;
    if(current){
      try{
        const revision=(await Promise.all([sourceRevision(t.audio),sourceRevision(t.cdg)])).join(':');
        if(!existing?.revision||existing.revision===revision){writeDemoCache.run(id,current.version,revision,Date.now());return {version:current.version,status:existing?'hit':'pilot'}}
      }catch{writeDemoCache.run(id,current.version,existing?.revision||null,Date.now());return {version:current.version,status:'hit'}}
    }
    if(audioActive>=2)throw Error('DEMOS_BUSY');
    audioActive++;
    try{
      let ar=null,cr=null;
      const results=await Promise.allSettled([audioDemo(t.audio,v=>ar=v),cdgDemo(t.cdg,v=>cr=v)]);
      if(results.some(x=>x.status==='rejected'))throw Error('DEMO_GENERATION_FAILED');
      const [audio,cdg]=results.map(x=>x.value),version=versionFor(audio,cdg);
      await publishDemo(id,version,audio,cdg);
      writeDemoCache.run(id,version,ar&&cr?ar+':'+cr:null,Date.now());
      console.log('PERU_DEMO_GENERATED',id,version,audio.length,cdg.length);
      return {version,status:'generated'};
    }finally{audioActive--}
  })();
  demoPending.set(id,work);
  try{return await work}finally{demoPending.delete(id)}
}
const handleCommerce=commerce({db,send,readJson,settings,quoteCart,dropboxOpen,adminSecret,dropboxTemporaryLink});
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost'),p=url.pathname;
    const viewerAuthorized=safeEq(req.headers.authorization||'','Basic '+Buffer.from('gabo:'+viewerPassword).toString('base64'));
    if(req.method==='GET'&&p==='/api/health')return send(res,200,viewerAuthorized?{status:'ok',environment:'peru-lab',tracks:db.prepare('SELECT count(*) AS n FROM tracks').get().n,lastSync:db.prepare("SELECT value FROM meta WHERE key='lastSync'").get()?.value??null,automaticSync:Boolean(process.env.GOOGLE_SHEETS_CLIENT_EMAIL&&process.env.GOOGLE_SHEETS_PRIVATE_KEY)}:{status:'ok'});
    if(req.method==='POST'&&p==='/api/internal/peru/sync'){
      if(!safeEq(req.headers.authorization||'','Bearer '+secret))return send(res,401,{error:'UNAUTHORIZED'});
      const {rows}=await readJson(req);return send(res,200,{tracks:publish(rows)});
    }
    if(await handleCommerce(req,res,url))return;
    if(p==='/checkout'&&req.method==='GET')return await staticFile(res,path.resolve('checkout.html'));
    if(p==='/admin/orders'&&req.method==='GET')return await staticFile(res,path.resolve('orders-admin.html'));
    if(p==='/api/admin/store/settings'){
      if(adminSecret.length<16||!safeEq(req.headers['x-admin-password']||'',adminSecret))return send(res,403,{error:'ADMIN_AUTH_REQUIRED'});
      if(req.method==='GET')return send(res,200,settings());
      if(req.method==='PUT'){try{const v=cleanSettings(await readJson(req));db.prepare('UPDATE meta SET value=? WHERE key=?').run(JSON.stringify(v),settingsKey);return send(res,200,v)}catch(e){return send(res,400,{error:e.message==='INVALID_SETTINGS'||e.message==='INVALID_PROMOTION'||e.message==='INVALID_OFFER'?e.message:'INVALID_SETTINGS'})}}
      return send(res,405,{error:'METHOD_NOT_ALLOWED'});
    }
    if(p==='/api/store/settings'&&req.method==='GET')return send(res,200,settings());
    if(p==='/api/store/quote'&&req.method==='POST'){try{return send(res,200,quoteCart((await readJson(req)).ids))}catch(e){return send(res,400,{error:e.message==='CART_ITEM_UNAVAILABLE'?e.message:'INVALID_CART'})}}
    if(req.method!=='GET')return send(res,405,{error:'METHOD_NOT_ALLOWED'});
    if(p==='/admin')return await staticFile(res,path.resolve('admin.html'));
    if(p==='/api/catalog/peru/index.json'){
      const tracks=db.prepare('SELECT id,artist,title,cover,format FROM tracks ORDER BY position').all();
      return send(res,200,{country:'PE',tracks});
    }
    const media=/^\/api\/preview\/cdg\/(PE-[a-f0-9]{24})\/(config|audio|cdg)$/.exec(p);
    if(media){
      const [,id,kind]=media,t=db.prepare('SELECT * FROM tracks WHERE id=?').get(id);
      if(!t)return send(res,404,{error:'NOT_FOUND'});
      if(!t.audio||!t.cdg)return send(res,404,{error:'DEMO_NOT_AVAILABLE'});
      if(kind==='config'){
        let cached=null;
        if(url.searchParams.get('legacy')!=='1'){
          try{cached=await resolveDemo(t)}catch(e){if(e.message==='DEMOS_BUSY')return send(res,429,{error:'DEMOS_BUSY'});console.warn('PERU_DEMO_RETRY',id,e.message?.slice(0,80));}
        }
        const ticket=encodeURIComponent(expireTicket(id));
        const fallbackAudioUrl='/api/preview/cdg/'+id+'/audio?ticket='+ticket,fallbackCdgUrl='/api/preview/cdg/'+id+'/cdg?ticket='+ticket;
        const base=cached?demoPilot.origin+'/peru/'+id+'/'+cached.version:null;
        return send(res,200,{karaokeId:id,title:t.title,artist:t.artist,startSeconds:0,sourceStartSeconds:35,durationSeconds:60,quality:'SDF_KARAOKE_PRO',visualPreset:{backgroundType:'gradient',backgroundValue:'linear-gradient(135deg,#0A0A0B 0%,#17171B 55%,#27272A 100%)',logoUrl:null},audioUrl:base?base+'/audio.mp3':fallbackAudioUrl,cdgUrl:base?base+'/graphics.cdg':fallbackCdgUrl,...(base?{mediaSource:'r2',cacheStatus:cached.status,fallbackAudioUrl,fallbackCdgUrl}:{mediaSource:'railway'})});
      }
      if(!validTicket(url.searchParams.get('ticket')||'',id))return send(res,401,{error:'DEMO_TICKET_INVALID'});
      if(kind==='cdg'){const data=await cdgDemo(t.cdg);res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':data.length,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});return res.end(data)}
      if(audioActive>=2)return send(res,429,{error:'DEMOS_BUSY'});
      audioActive++;try{const b=await audioDemo(t.audio);res.writeHead(200,{'Content-Type':'audio/mpeg','Content-Length':b.length,'Cache-Control':'private, no-store','Accept-Ranges':'none'});return res.end(b)}finally{audioActive--}
    }
    if(p==='/')return await staticFile(res,path.resolve('index.html'));
    if(['/mp4/store-video.mjs','/mp4/cdg-webcodecs-deps.mjs','/mp4/squooshhqx_bg.wasm'].includes(p))return await staticFile(res,path.resolve('mp4',path.basename(p)));
    if(/^\/cdg-player\/[a-zA-Z0-9._-]+$/.test(p))return await staticFile(res,path.resolve('public',p.slice(1)));
    return send(res,404,{error:'NOT_FOUND'});
  }catch(e){console.warn('LAB_ERROR',e.message?.slice(0,120));if(!res.headersSent)send(res,500,{error:'LAB_REQUEST_FAILED'});else res.destroy()}
});
server.listen(Number(process.env.PORT||8080),'0.0.0.0',()=>console.log('PERU_LAB_READY'));
