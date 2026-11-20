import {createHash,createHmac,randomBytes} from 'node:crypto';
const PART=16*1024*1024,MAX=512*1024*1024,LEASE=60*60*1000;
const err=(status,code)=>Object.assign(Error(code),{status});
const idOk=x=>typeof x==='string'&&/^PE-[a-f0-9]{24}$/.test(x), verOk=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
export function videoCache({db,send,readJson,requireUser,csrf,owned,admin,sourceRevision,deliveryOrigin,deliverySecret}){
 db.exec(`CREATE TABLE IF NOT EXISTS peru_mp4_cache(id TEXT NOT NULL, version TEXT NOT NULL, nonce TEXT NOT NULL, status TEXT NOT NULL, audio TEXT NOT NULL, cdg TEXT NOT NULL, artist TEXT NOT NULL,title TEXT NOT NULL,size INTEGER NOT NULL,started INTEGER NOT NULL,updated INTEGER NOT NULL,PRIMARY KEY(id,version))`);
 const enabled=!!deliveryOrigin&&deliverySecret.length>=32&&typeof sourceRevision==='function';
 const row=(id,version)=>db.prepare('SELECT * FROM peru_mp4_cache WHERE id=? AND version=?').get(id,version);
 const key=r=>`mp4/${r.id}/${r.version}/${r.nonce}.mp4`;
 const change=(r,from,to)=>db.prepare('UPDATE peru_mp4_cache SET status=?,updated=? WHERE id=? AND version=? AND nonce=? AND status=?').run(to,Date.now(),r.id,r.version,r.nonce,from).changes;
 const version=async t=>createHash('sha256').update(JSON.stringify(['720p-renderer-v1',t.id||t.track_id,...await Promise.all([sourceRevision(t.audio),sourceRevision(t.cdg)])])).digest('hex');
 const sign=(op,r,more={})=>{const body=Buffer.from(JSON.stringify({op,key:key(r),exp:Date.now()+(op==='upload'?LEASE:15*60*1000),...more})).toString('base64url');return body+'.'+createHmac('sha256',deliverySecret).update(body).digest('base64url')};
 const url=(op,r,more)=>`${deliveryOrigin}/cache/${op}?token=${encodeURIComponent(sign(op,r,more))}`;
 async function control(action,r,more={}){const response=await fetch(`${deliveryOrigin}/cache/control`,{method:'POST',headers:{'Content-Type':'application/json','X-Delivery-Secret':deliverySecret},body:JSON.stringify({action,key:key(r),...more}),signal:AbortSignal.timeout(15000),redirect:'error'});if(!response.ok)throw err(503,'CACHE_UNAVAILABLE');return response.json()}
 async function reconcile(r){if(r.status!=='uploading')return r;const h=await control('head',r);if(h.exists&&h.size===r.size){change(r,'uploading','pending');return row(r.id,r.version)}return r}
 const info=r=>({id:r.id,version:r.version,artist:r.artist,title:r.title,size:r.size,status:r.status,updated:r.updated,...(r.status==='pending'||r.status==='approved'?{previewUrl:url('preview',r)}:{})});
 return async(req,res,p,m)=>{
  const match=/^\/api\/my-karaokes\/(PE-[a-f0-9]{24})\/video\/cache$/.exec(p);
  if(match&&m==='POST'){
   const u=requireUser(req);csrf(req,u);const id=match[1],t=owned(u,id);if(!t)throw err(404,'PURCHASE_REQUIRED');
   if(!enabled){send(res,200,{status:'disabled'});return true}
   const b=await readJson(req);if(!['lookup','offer','finish'].includes(b.action))throw err(400,'INVALID_CACHE_ACTION');
   // Never deliver a previous revision after either original source changes.
   let v;try{v=await version(t)}catch{send(res,200,{status:'unavailable'});return true}
   let r=row(id,v);
   if(b.action==='lookup'){
    if(r?.status==='approved'){try{const h=await control('head',r);if(h.exists&&h.size===r.size){send(res,200,{status:'ready',url:url('download',r,{name:(t.artist+' - '+t.title+' - HD 720p.mp4').slice(0,180)})});return true}}catch{};send(res,200,{status:'unavailable'});return true}
    if(r?.status==='uploading')try{r=await reconcile(r)}catch{}
    send(res,200,{status:r?.status==='pending'?'pending':r?.status==='uploading'&&Date.now()-r.started<LEASE?'uploading':'missing',version:v});return true;
   }
   if(b.version!==v){send(res,200,{status:'changed'});return true}
   if(b.action==='finish'){
    if(!r||r.nonce!==b.nonce)throw err(409,'CACHE_CLAIM_CHANGED');r=await reconcile(r);send(res,200,{status:r.status});return true;
   }
   if(!Number.isSafeInteger(b.size)||b.size<10000||b.size>MAX)throw err(400,'CACHE_SIZE');
   // Claim one upload for this revision. An expired claim gets a new object key,
   // so even a stale browser cannot replace an approved or reviewed object.
   if(r?.status==='uploading'){try{r=await reconcile(r)}catch{send(res,200,{status:'unavailable'});return true}}
   const now=Date.now(),nonce=randomBytes(24).toString('hex');
   const claimed=db.prepare(`INSERT INTO peru_mp4_cache VALUES(?,?,?,'uploading',?,?,?,?,?,?,?) ON CONFLICT(id,version) DO UPDATE SET nonce=excluded.nonce,status='uploading',audio=excluded.audio,cdg=excluded.cdg,artist=excluded.artist,title=excluded.title,size=excluded.size,started=excluded.started,updated=excluded.updated WHERE peru_mp4_cache.status='rejected' OR (peru_mp4_cache.status='uploading' AND peru_mp4_cache.started<?)`).run(id,v,nonce,t.audio,t.cdg,t.artist,t.title,b.size,now,now,now-LEASE).changes;
   if(!claimed){send(res,200,{status:row(id,v)?.status||'unavailable'});return true}
   r=row(id,v);
   try{const up=await control('init',r,{size:r.size});send(res,200,{status:'upload',version:v,nonce,partSize:PART,url:url('upload',r,{uploadId:up.uploadId,size:r.size})})}catch{change(r,'uploading','rejected');send(res,200,{status:'unavailable'})}return true;
  }
  if(p==='/api/admin/video-cache'&&m==='GET'){
   admin(req);if(!enabled){send(res,200,{items:[],enabled:false});return true}
   // Recover completed uploads if the browser closed after sending the last part.
   const unfinished=db.prepare("SELECT * FROM peru_mp4_cache WHERE status='uploading' ORDER BY updated DESC LIMIT 10").all();await Promise.allSettled(unfinished.map(reconcile));
   const rows=db.prepare("SELECT * FROM peru_mp4_cache WHERE status IN ('pending','approved') ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END,updated DESC LIMIT 200").all();send(res,200,{items:rows.map(info),enabled:true});return true;
  }
  const review=/^\/api\/admin\/video-cache\/(PE-[a-f0-9]{24})\/([a-f0-9]{64})$/.exec(p);
  if(review&&m==='POST'){
   admin(req);if(!enabled)throw err(503,'CACHE_UNAVAILABLE');const b=await readJson(req),r=row(review[1],review[2]);if(!r||r.status!=='pending')throw err(409,'CACHE_NOT_PENDING');
   if(b.action==='approve'){
    if(b.confirmed!==true)throw err(400,'REVIEW_REQUIRED');if(await version(r)!==r.version)throw err(409,'SOURCE_CHANGED');const h=await control('head',r);if(!h.exists||h.size!==r.size)throw err(409,'CACHE_MISSING');if(!change(r,'pending','approved'))throw err(409,'CACHE_NOT_PENDING');
   }else if(b.action==='reject'){if(!change(r,'pending','rejected'))throw err(409,'CACHE_NOT_PENDING');await control('delete',r).catch(()=>{})}else throw err(400,'INVALID_CACHE_ACTION');
   send(res,200,{status:row(r.id,r.version).status});return true;
  }
  return false;
 };
}
