/**
 * Reglas de acceso VIP para el LAB Cloudflare (solo lectura).
 * No permite emitir tickets ni descargar archivos; las sesiones son sintéticas.
 */
import {requireLabUser, sameBytes, type LabEnv, type LabUser} from "./auth-lab";
import {handlePublicApi} from "./public-api";
interface AccessEnv extends LabEnv {ASSETS:Fetcher}
interface CollectionRow {id:string;active:number;year:number;month:number;published_at:number|null}
interface OverrideRow {collection_id:string;enabled:number;expires_at:number|null}
interface UserMembership {subscription_start:number|null;subscription_end:number|null;legacy_pending_expiry:number}
function failure(code:number,error:string):Response {
  return Response.json({error,message:"No autorizado para esta operación",statusCode:code},{
    status:code,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}
  });
}
function json(value:unknown):Response{
  return Response.json(value,{status:200,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
}
function addMonths(secs:number,n:number):number{
  const start=new Date(secs*1000);
  const yr=start.getUTCFullYear(),month=start.getUTCMonth(),day=start.getUTCDate();
  const target=new Date(Date.UTC(yr,month+n,1,start.getUTCHours(),start.getUTCMinutes(),start.getUTCSeconds()));
  const last=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate();
  target.setUTCDate(Math.min(day,last));
  return Math.floor(target.getTime()/1000);
}
function deadline(user:UserMembership,tier:string):number|null{
  const start=user.subscription_start,end=user.subscription_end;
  if(start&&user.legacy_pending_expiry===1&&!end)return 253402214400;
  if(!start||!end)return null;
  const cap=tier==="MONTH"?start+30*86400:
      addMonths(start,tier==="SIX_MONTHS"?6:12);
  return Math.min(cap,end);
}
function tier(slug:string|null):string|null {
  if(slug==="pro-mensual")return "MONTH";
  if(slug==="pro-semestral")return "SIX_MONTHS";
  if(slug==="pro-anual")return "YEAR";
  return null;
}
async function allowedIds(env:AccessEnv,user:LabUser):Promise<Set<string>>{
  const collections=await env.DB.prepare(
    "SELECT id,active,year,month,published_at FROM collections WHERE active=1"
  ).all<CollectionRow>();
  if(user.role==="ADMIN")return new Set((collections.results??[]).map(c=>c.id));
  const now=Math.floor(Date.now()/1000);
  const info=await env.DB.prepare(
    "SELECT subscription_start,subscription_end,legacy_pending_expiry FROM users WHERE id=?"
  ).bind(user.id).first<UserMembership>();
  if(!info||user.status!=="ACTIVE"||(user.subscription_end!==null&&user.subscription_end<now))
    return new Set();
  const plan=user.plan_id?await env.DB.prepare("SELECT slug FROM plans WHERE id=?").bind(user.plan_id).first<{slug:string}>():null;
  const currentTier=tier(plan?.slug??null);
  const overrides=await env.DB.prepare(
    "SELECT collection_id,enabled,expires_at FROM user_collection_access WHERE user_id=?"
  ).bind(user.id).all<OverrideRow>();
  const byId=new Map((overrides.results??[]).map(o=>[o.collection_id,o]));
  const start=info.subscription_start;
  const end=currentTier?deadline(info,currentTier):null;
  const membershipActive=Boolean(currentTier&&start&&end&&start<=now&&end>now);
  const result=new Set<string>();
  for(const c of collections.results??[]){
    const override=byId.get(c.id);
    if(override?.enabled===0||(override?.expires_at!==null&&override?.expires_at!==undefined&&override.expires_at<now))continue;
    if(!currentTier){
      if(override?.enabled===1)result.add(c.id);
      continue;
    }
    if(!membershipActive)continue;
    if(currentTier==="YEAR"){result.add(c.id);continue;}
    if(currentTier==="MONTH"){
      if(c.year===2026)result.add(c.id);
      continue;
    }
    // Plan semestral: año de compra completo + novedades dentro de su plazo.
    const purchaseYear=new Date(start!*1000).getUTCFullYear();
    if(c.year===purchaseYear){result.add(c.id);continue;}
    if(c.year<purchaseYear||c.month<1||c.month>12)continue;
    const monthStart=Date.UTC(c.year,c.month-1,1)/1000;
    if(monthStart<end! && (!c.published_at||c.published_at<end!))result.add(c.id);
  }
  return result;
}
async function publicRequest(env:AccessEnv,url:URL,path:string):Promise<unknown>{
  const target=new URL(path,url.origin);
  const res=await handlePublicApi(new Request(target.toString()),target,env);
  if(!res||!res.ok)throw new Error("La réplica pública no respondió");
  return res.json();
}
export async function handleLabCollections(request:Request,env:AccessEnv,url:URL):Promise<Response|undefined>{
  const list=url.pathname==="/api/collections";
  const detail=/^\/api\/collections\/([^/]+)$/.exec(url.pathname);
  if(!list&&!detail)return undefined;
  if(!env.LAB_GATE_KEY||!sameBytes(request.headers.get("X-Lab-Key")||"",env.LAB_GATE_KEY))
    return failure(404,"MIGRATION_LAB_ROUTE_DISABLED");
  if(!env.LAB_JWT_SECRET)return failure(503,"LAB_NOT_CONFIGURED");
  if(request.method!=="GET")return failure(405,"METHOD_NOT_ALLOWED");
  const user=await requireLabUser(request,env);
  if(!user)return failure(401,"UNAUTHORIZED");
  const allowed=await allowedIds(env,user);
  if(list){
    const all=await publicRequest(env,url,"/api/public/collections") as Array<Record<string,unknown>>;
    return json(all.map(c=>({...c,locked:!allowed.has(String(c.id))})));
  }
  const id=decodeURIComponent(detail![1]);
  if(!allowed.has(id))return failure(403,"ACCESS_NOT_GRANTED");
  try{
    return json(await publicRequest(env,url,"/api/public/collections/"+encodeURIComponent(id)));
  }catch{return failure(404,"COLLECTION_NOT_FOUND");}
}
