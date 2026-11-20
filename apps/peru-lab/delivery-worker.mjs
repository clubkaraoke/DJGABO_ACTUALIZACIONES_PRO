import {cacheRoutes} from './mp4-cache-worker.mjs';
const SHOP='https://djgabo-tienda-peru-lab-production.up.railway.app';
const endpoint=SHOP+'/api/internal/peru/delivery/redeem';
const cors={'Access-Control-Allow-Origin':SHOP,'Access-Control-Allow-Methods':'GET, OPTIONS','Access-Control-Allow-Headers':'X-Conversion-Ticket','Access-Control-Expose-Headers':'Content-Length, X-DJGABO-Delivery','Access-Control-Max-Age':'600','Vary':'Origin','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const error=(status,code)=>new Response(JSON.stringify({error:code}),{status,headers:{...cors,'Content-Type':'application/json'}});
function validLink(s){try{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&(u.hostname==='dropboxusercontent.com'||u.hostname.endsWith('.dropboxusercontent.com'))?u:null}catch{return null}}
export default {async fetch(req,env){
 const cached=await cacheRoutes(req,env);if(cached)return cached;
 const p=new URL(req.url).pathname;
 if(p==='/health'&&req.method==='GET')return new Response(JSON.stringify({status:'ok',service:'djgabo-karaoke-delivery-lab',mp4Configured:!!env.MP4,configured:typeof env.DELIVERY_SECRET==='string'&&env.DELIVERY_SECRET.length>=32}),{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 const route=/^\/peru\/(PE-[a-f0-9]{24})\/(audio|cdg)$/.exec(p);
 if(!route)return error(404,'NOT_FOUND');
 if(req.headers.get('Origin')!==SHOP)return error(403,'ORIGIN_DENIED');
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(req.method!=='GET')return error(405,'METHOD_NOT_ALLOWED');
 const ticket=req.headers.get('X-Conversion-Ticket');if(!ticket||!/^[a-f0-9]{64}$/.test(ticket))return error(403,'TICKET_REQUIRED');
 if(typeof env.DELIVERY_SECRET!=='string'||env.DELIVERY_SECRET.length<32)return error(503,'DELIVERY_NOT_CONFIGURED');
 try{
  const auth=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','X-Delivery-Secret':env.DELIVERY_SECRET,'Cache-Control':'no-store'},body:JSON.stringify({ticket,id:route[1],kind:route[2]}),redirect:'manual'});
  if(!auth.ok){await auth.body?.cancel();return error(auth.status===403||auth.status===404?403:502,'DELIVERY_DENIED')}
  const data=await auth.json();let link=validLink(data.link);if(!link)return error(502,'INVALID_ORIGIN');
  let upstream;
  for(let i=0;i<4;i++){
   upstream=await fetch(link.href,{redirect:'manual',cache:'no-store',headers:{'Accept-Encoding':'identity'}});
   if(upstream.status>=300&&upstream.status<400){const location=upstream.headers.get('Location');await upstream.body?.cancel();link=location?validLink(new URL(location,link).href):null;if(!link)return error(502,'INVALID_ORIGIN');upstream=null;continue}break;
  }
  if(!upstream?.ok||!upstream.body){await upstream?.body?.cancel();return error(502,'DROPBOX_UNAVAILABLE')}
  // Forward only bytes; never expose the Dropbox URL, cookies, or upstream metadata.
  const headers={...cors,'Content-Type':'application/octet-stream','X-DJGABO-Delivery':'cloudflare'};
  const len=upstream.headers.get('Content-Length');if(len&&/^\d+$/.test(len)&&!upstream.headers.get('Content-Encoding'))headers['Content-Length']=len;
  return new Response(upstream.body,{headers});
 }catch{return error(502,'DELIVERY_UNAVAILABLE')}
}};
