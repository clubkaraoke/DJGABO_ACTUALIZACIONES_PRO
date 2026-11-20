import manifest from './demo-pilot-manifest.json' with {type:'json'};
const publicHeaders={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, HEAD, OPTIONS','Access-Control-Allow-Headers':'Range','Access-Control-Expose-Headers':'Content-Length, Content-Range, Accept-Ranges, ETag, X-DJGABO-Demo','X-Content-Type-Options':'nosniff'};
function fail(status,code,extra={}){return new Response(JSON.stringify({error:code}),{status,headers:{...publicHeaders,...extra,'Content-Type':'application/json','Cache-Control':'no-store'}})}
function parseRange(value,size){
 const m=/^bytes=(\d*)-(\d*)$/.exec(value);
 if(!m||(!m[1]&&!m[2])||!size)return null;
 let offset,end;
 if(!m[1]){const suffix=Number(m[2]);if(!Number.isSafeInteger(suffix)||suffix<=0)return null;offset=Math.max(0,size-suffix);end=size-1;}
 else{offset=Number(m[1]);end=m[2]?Math.min(Number(m[2]),size-1):size-1;}
 return Number.isSafeInteger(offset)&&Number.isSafeInteger(end)&&offset>=0&&offset<size&&end>=offset?{offset,length:end-offset+1}:null;
}
export default {async fetch(req,env){
 const pathname=new URL(req.url).pathname;
 if(pathname==='/health'&&req.method==='GET')return Response.json({status:'ok',service:'djgabo-karaoke-demos-lab',demos:Object.keys(manifest.items).length,onDemand:true},{headers:{'Cache-Control':'no-store'}});
 const upload=/^\/internal\/publish\/(PE-[a-f0-9]{24})\/([a-f0-9]{24})\/(audio\.mp3|graphics\.cdg|ready)$/.exec(pathname);
 if(upload){
  if(req.method!=='POST')return fail(405,'METHOD_NOT_ALLOWED');
  if(!env.DEMO_PUBLISH_SECRET||req.headers.get('Authorization')!=='Bearer '+env.DEMO_PUBLISH_SECRET)return fail(403,'FORBIDDEN');
  const [,id,version,file]=upload,base=`peru/${id}/${version}/`;
  if(manifest.items[id]?.version===version)return fail(409,'PILOT_IMMUTABLE');
  try{
   if(file==='ready'){
    const [audio,cdg]=await Promise.all([env.DEMOS.head(base+'audio.mp3'),env.DEMOS.head(base+'graphics.cdg')]);
    if(!audio||!cdg)return fail(409,'INCOMPLETE_DEMO');
    const entry={version,audioBytes:audio.size,cdgBytes:cdg.size};
    await env.DEMOS.put(base+'ready.json',JSON.stringify(entry));
    return Response.json(entry);
   }
   const length=Number(req.headers.get('Content-Length')),isAudio=file==='audio.mp3';
   if(!Number.isInteger(length)||length<=0||length>(isAudio?1500000:691200)||(!isAudio&&length%24))return fail(400,'INVALID_DEMO_SIZE');
   const key=base+file;
   if(await env.DEMOS.head(base+'ready.json'))return fail(409,'DEMO_IMMUTABLE');
   const bytes=await req.arrayBuffer();
   if(bytes.byteLength!==length)return fail(400,'INVALID_DEMO_SIZE');
   await env.DEMOS.put(key,bytes,{httpMetadata:{contentType:isAudio?'audio/mpeg':'application/octet-stream'}});
   return Response.json({ok:true});
  }catch{return fail(502,'PUBLISH_FAILED')}
 }
 const m=/^\/peru\/(PE-[a-f0-9]{24})\/([a-f0-9]{24})\/(audio\.mp3|graphics\.cdg)$/.exec(pathname);
 if(!m)return fail(404,'DEMO_NOT_FOUND');
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{...publicHeaders,'Access-Control-Max-Age':'600'}});
 if(!['GET','HEAD'].includes(req.method))return fail(405,'METHOD_NOT_ALLOWED');
 const key=pathname.slice(1),isAudio=m[3]==='audio.mp3';
 try{
 let entry=manifest.items[m[1]];
 if(entry?.version!==m[2]){const ready=await env.DEMOS.get(`peru/${m[1]}/${m[2]}/ready.json`);if(!ready)return fail(404,'DEMO_NOT_FOUND');entry=await ready.json()}
 if(entry.version!==m[2])return fail(404,'DEMO_NOT_FOUND');
 const length=isAudio?entry.audioBytes:entry.cdgBytes;
 const range=req.headers.get('Range'),part=range&&parseRange(range,length);
 if(range&&!part)return fail(416,'INVALID_RANGE',{'Content-Range':'bytes */'+length});
  const o=req.method==='HEAD'?await env.DEMOS.head(key):await env.DEMOS.get(key,part?{range:part}:undefined);
  if(!o)return fail(404,'DEMO_NOT_FOUND');
  if(o.size!==length)return fail(502,'DEMO_SIZE_MISMATCH');
  const headers={...publicHeaders,'Content-Type':isAudio?'audio/mpeg':'application/octet-stream','Content-Length':String(part?part.length:length),'Accept-Ranges':'bytes','Cache-Control':'public, max-age=86400, immutable','ETag':o.httpEtag,'X-DJGABO-Demo':'r2'};
  if(part)headers['Content-Range']='bytes '+part.offset+'-'+(part.offset+part.length-1)+'/'+length;
  return new Response(req.method==='HEAD'?null:o.body,{status:part?206:200,headers});
 }catch{return fail(502,'DEMO_UNAVAILABLE')}
}};
