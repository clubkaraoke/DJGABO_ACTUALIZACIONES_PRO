const SHOP='https://djgabo-tienda-peru-lab-production.up.railway.app',PART=16*1024*1024,MAX=512*1024*1024;
const keyOk=k=>typeof k==='string'&&/^mp4\/PE-[a-f0-9]{24}\/[a-f0-9]{64}\/[a-f0-9]{48}\.mp4$/.test(k);
const cors={'Access-Control-Allow-Origin':SHOP,'Access-Control-Allow-Methods':'GET, HEAD, PUT, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Expose-Headers':'Content-Length, Content-Range','Access-Control-Max-Age':'600','Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Vary':'Origin'};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json'}});
const fail=(status,error)=>json({error},status);
function decode(s){return Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))}
async function claims(token,secret){try{if(typeof token!=='string'||token.length>4096)return null;const [body,sig,extra]=token.split('.');if(extra||!body||!sig)return null;const encoder=new TextEncoder(),key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);if(!await crypto.subtle.verify('HMAC',key,decode(sig),encoder.encode(body)))return null;const c=JSON.parse(new TextDecoder().decode(decode(body)));return keyOk(c.key)&&Number.isFinite(c.exp)&&c.exp>Date.now()?c:null}catch{return null}}
export async function cacheRoutes(req,env){
 const u=new URL(req.url),p=u.pathname;if(!p.startsWith('/cache/'))return null;
 if(!env.MP4||typeof env.DELIVERY_SECRET!=='string'||env.DELIVERY_SECRET.length<32)return fail(503,'CACHE_NOT_CONFIGURED');
 if(req.method==='OPTIONS')return req.headers.get('Origin')===SHOP?new Response(null,{status:204,headers:cors}):fail(403,'ORIGIN_DENIED');
 try{
  if(p==='/cache/control'&&req.method==='POST'){
   if(req.headers.get('X-Delivery-Secret')!==env.DELIVERY_SECRET)return fail(403,'DENIED');const b=await req.json();if(!keyOk(b.key))return fail(400,'KEY');
   if(b.action==='head'){const o=await env.MP4.head(b.key);return json({exists:!!o,size:o?.size||0})}
   if(b.action==='init'){if(!Number.isSafeInteger(b.size)||b.size<10000||b.size>MAX)return fail(400,'SIZE');if(await env.MP4.head(b.key))return fail(409,'EXISTS');const up=await env.MP4.createMultipartUpload(b.key,{httpMetadata:{contentType:'video/mp4'}});return json({uploadId:up.uploadId})}
   if(b.action==='delete'){await env.MP4.delete(b.key);return json({ok:true})}return fail(400,'ACTION');
  }
  const c=await claims(u.searchParams.get('token'),env.DELIVERY_SECRET);if(!c)return fail(403,'TOKEN');
  if(p==='/cache/upload'&&c.op==='upload'){
   if(req.headers.get('Origin')!==SHOP||!Number.isSafeInteger(c.size)||c.size<10000||c.size>MAX||typeof c.uploadId!=='string')return fail(403,'UPLOAD_DENIED');
   const count=Math.ceil(c.size/PART),upload=env.MP4.resumeMultipartUpload(c.key,c.uploadId);
   if(req.method==='PUT'){
    const n=Number(u.searchParams.get('part')),expected=Math.min(PART,c.size-(n-1)*PART);if(!Number.isInteger(n)||n<1||n>count||Number(req.headers.get('Content-Length'))!==expected)return fail(400,'PART_SIZE');
    const bytes=await req.arrayBuffer();if(bytes.byteLength!==expected)return fail(400,'PART_SIZE');if(n===1&&new TextDecoder().decode(bytes.slice(4,8))!=='ftyp')return fail(422,'INVALID_MP4');return json(await upload.uploadPart(n,bytes));
   }
   if(req.method==='POST'){
    if(await env.MP4.head(c.key))return json({ok:true});const b=await req.json();if(!Array.isArray(b.parts)||b.parts.length!==count||b.parts.some((x,i)=>x.partNumber!==i+1||typeof x.etag!=='string'||x.etag.length>150))return fail(400,'PARTS');const o=await upload.complete(b.parts.map(x=>({partNumber:x.partNumber,etag:x.etag})));if(o.size!==c.size)return fail(422,'SIZE');return json({ok:true,size:o.size});
   }return fail(405,'METHOD');
  }
  if((p==='/cache/download'&&c.op==='download'||p==='/cache/preview'&&c.op==='preview')&&['GET','HEAD'].includes(req.method)){
   const head=await env.MP4.head(c.key);if(!head)return fail(404,'MISSING');const headers={...cors,'Content-Type':'video/mp4','Accept-Ranges':'bytes','Content-Length':String(head.size),'Content-Disposition':c.op==='download'?`attachment; filename="karaoke-HD.mp4"; filename*=UTF-8''${encodeURIComponent(String(c.name||'karaoke-HD.mp4')).replace(/'/g,'%27')}`:'inline'};
   if(req.method==='HEAD')return new Response(null,{headers});let range;const h=req.headers.get('Range');if(h){const m=/^bytes=(\d+)-(\d*)$/.exec(h),s=m?Number(m[1]):-1,e=m&&m[2]?Math.min(Number(m[2]),head.size-1):head.size-1;if(!m||!Number.isSafeInteger(s)||!Number.isSafeInteger(e)||s<0||s>e||s>=head.size)return new Response(null,{status:416,headers:{...cors,'Content-Range':`bytes */${head.size}`}});range={offset:s,length:e-s+1};headers['Content-Length']=String(range.length);headers['Content-Range']=`bytes ${s}-${e}/${head.size}`}
   const o=await env.MP4.get(c.key,range?{range}:{});return o?new Response(o.body,{status:range?206:200,headers}):fail(404,'MISSING');
  }return fail(403,'DENIED');
 }catch{return fail(502,'CACHE_UNAVAILABLE')}
}
