/**
 * Autenticación AISLADA de laboratorio.
 * - Una clave LAB_GATE_KEY protege todas las rutas de auth/dispositivos
 * - Solo permite cuentas id=labusr_... (NO permite login de clientes reales)
 * - Bcrypt verificado en Workers; access JWT HS256 con jose
 * - Tokens y dispositivos exclusivamente LAB, no se confían los de Railway
 * - Ratchet rate limit por IP anónima y minuto en D1
 *
 * NO se deben retirar estas barreras sin implementar rate limiting WAF,
 * sesión y concurrencia en producción y completar pruebas con clientes.
 */
import bcrypt from "bcryptjs";
import { jwtVerify, SignJWT } from "jose";

export interface LabEnv {
  DB: D1Database;
  LAB_GATE_KEY: string;
  LAB_JWT_SECRET: string;
}

interface LabUser {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  avatar_url: string | null;
  role: string;
  status: string;
  plan_id: string | null;
  subscription_start: number | null;
  subscription_end: number | null;
  max_devices: number;
}
interface PlanRow { id:string; name:string; slug:string; max_devices:number }
const encoder = new TextEncoder();
const ttl = 15 * 60;
const issuer = "djgabo-cloudflare-migration-lab";
const secs = () => Math.floor(Date.now() / 1000);
const isLabUser = (id:string) => id.startsWith("labusr_");
function apiError(status:number, error:string, message:string): Response {
  return Response.json({error,message,statusCode:status},{
    status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}
  });
}
function sameBytes(a:string,b:string):boolean {
  const x=encoder.encode(a),y=encoder.encode(b);
  if (x.length!==y.length) return false;
  let difference=0;
  for(let i=0;i<x.length;i++) difference|=x[i]^y[i];
  return difference===0;
}
function response(body:unknown,status=200):Response {
  return Response.json(body,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
}
function b64url(bytes:Uint8Array):string {
  let s="";
  for(let i=0;i<bytes.length;i++)s+=String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
async function digest(value:string):Promise<string> {
  const result=await crypto.subtle.digest("SHA-256",encoder.encode(value));
  return [...new Uint8Array(result)].map(n=>n.toString(16).padStart(2,"0")).join("");
}
function secret(env:LabEnv,purpose:"access"|"device"):Uint8Array {
  return encoder.encode(purpose+":"+env.LAB_JWT_SECRET);
}
async function issueAccess(env:LabEnv,user:LabUser):Promise<string>{
  return new SignJWT({role:user.role})
    .setProtectedHeader({alg:"HS256",typ:"JWT"})
    .setSubject(user.id).setIssuer(issuer).setAudience("access")
    .setIssuedAt().setExpirationTime(secs()+ttl)
    .sign(secret(env,"access"));
}
async function requireUser(request:Request,env:LabEnv):Promise<LabUser | null> {
  const bearer=/^Bearer (.+)$/.exec(request.headers.get("Authorization")||"");
  if(!bearer||!bearer[1])return null;
  try{
    const {payload}=await jwtVerify(bearer[1],secret(env,"access"),{
      issuer,audience:"access",algorithms:["HS256"],clockTolerance:0,
    });
    if(typeof payload.sub!=="string"||!isLabUser(payload.sub))return null;
    const user=await env.DB.prepare(
      "SELECT id,email,password_hash,name,avatar_url,role,status,plan_id,subscription_start,subscription_end,max_devices FROM users WHERE id=?"
    ).bind(payload.sub).first<LabUser>();
    if(!user||user.status!=="ACTIVE"||(user.subscription_end && user.subscription_end<secs()))return null;
    return user;
  }catch{return null;}
}
async function toMe(env:LabEnv,user:LabUser){
  const plan=user.plan_id ? await env.DB.prepare(
    "SELECT id,name,slug,max_devices FROM plans WHERE id=?"
  ).bind(user.plan_id).first<PlanRow>() : null;
  const devices=await env.DB.prepare(
    "SELECT COUNT(*) AS total FROM device_sessions WHERE user_id=? AND active=1"
  ).bind(user.id).first<{total:number}>();
  const stamp=(s:number|null)=>s?new Date(s*1000).toISOString():null;
  return {
    id:user.id,email:user.email,name:user.name,avatarUrl:user.avatar_url,
    role:user.role,status:user.status,
    plan:plan?{id:plan.id,name:plan.name,slug:plan.slug,maxDevices:plan.max_devices}:null,
    subscriptionStart:stamp(user.subscription_start),
    subscriptionEnd:stamp(user.subscription_end),
    maxDevices:user.max_devices,devicesUsed:devices?.total??0,
  };
}
async function parseJSON(request:Request):Promise<Record<string,unknown>|null> {
  if(Number(request.headers.get("Content-Length"))>4096)return null;
  try{
    const text=await request.text();
    if(text.length>4096)return null;
    const value=JSON.parse(text);
    return value && typeof value==="object"&&!Array.isArray(value)?value:null;
  }catch{return null;}
}
async function rateLimit(request:Request,env:LabEnv):Promise<boolean>{
  const bucket=Math.floor(secs()/60)*60;
  const ip=(request.headers.get("CF-Connecting-IP")||"unknown").slice(0,80);
  const id=await digest(env.LAB_GATE_KEY+":"+bucket+":"+ip);
  const result=await env.DB.prepare(
    "INSERT INTO lab_auth_rate (key,window_start,attempts) VALUES (?,?,1) "+
    "ON CONFLICT(key) DO UPDATE SET attempts=attempts+1 WHERE attempts<8"
  ).bind(id,bucket).run();
  return (result.meta.changes??0)>0;
}
async function issueSession(env:LabEnv,user:LabUser){
  const token=b64url(crypto.getRandomValues(new Uint8Array(48)));
  const hash=await digest(token);
  await env.DB.prepare(
    "INSERT INTO refresh_tokens(id,user_id,token_hash,expires_at,revoked_at,created_at) VALUES(?,?,?,?,NULL,?)"
  ).bind("labrt_"+crypto.randomUUID(),user.id,hash,secs()+30*86400,secs()).run();
  return {accessToken:await issueAccess(env,user),refreshToken:token,user:await toMe(env,user)};
}
async function login(request:Request,env:LabEnv):Promise<Response>{
  if(!await rateLimit(request,env))return apiError(429,"RATE_LIMITED","Intenta nuevamente más tarde.");
  const body=await parseJSON(request);
  if(typeof body?.email!=="string"||typeof body?.password!=="string"||
      body.email.length>254||body.password.length>128)return apiError(400,"INVALID_INPUT","Email o contraseña inválidos");
  const email=body.email.trim().toLowerCase();
  const row=await env.DB.prepare(
    "SELECT id,email,password_hash,name,avatar_url,role,status,plan_id,subscription_start,subscription_end,max_devices "+
    "FROM users WHERE email=? AND id LIKE 'labusr_%'"
  ).bind(email).first<LabUser>();
  // Test users only: jamás se activan cuentas reales del snapshot de Railway.
  if(!row||!await bcrypt.compare(body.password,row.password_hash))return apiError(401,"INVALID_CREDENTIALS","Email o contraseña incorrectos");
  if(row.status==="SUSPENDED")return apiError(403,"USER_SUSPENDED","Cuenta suspendida");
  if(row.status!=="ACTIVE"||(row.subscription_end!==null && row.subscription_end<secs()))
    return apiError(403,"USER_EXPIRED","Membresía vencida");
  return response(await issueSession(env,row));
}
async function refresh(request:Request,env:LabEnv):Promise<Response>{
  const body=await parseJSON(request);
  if(typeof body?.refreshToken!=="string"||body.refreshToken.length>256)
    return apiError(400,"INVALID_INPUT","refreshToken requerido");
  const hash=await digest(body.refreshToken);
  const current=await env.DB.prepare(
    "SELECT id,user_id,expires_at,revoked_at FROM refresh_tokens "+
    "WHERE token_hash=? AND id LIKE 'labrt_%'"
  ).bind(hash).first<{id:string,user_id:string,expires_at:number,revoked_at:number|null}>();
  if(!current||current.revoked_at!==null||current.expires_at<=secs()||!isLabUser(current.user_id))
    return apiError(401,"INVALID_REFRESH_TOKEN","Sesión expirada");
  const user=await env.DB.prepare(
    "SELECT id,email,password_hash,name,avatar_url,role,status,plan_id,subscription_start,subscription_end,max_devices "+
    "FROM users WHERE id=?"
  ).bind(current.user_id).first<LabUser>();
  if(!user||user.status!=="ACTIVE"||(user.subscription_end && user.subscription_end<secs()))
    return apiError(403,"USER_NOT_ACTIVE","Cuenta no activa");
  const result=await env.DB.prepare(
    "UPDATE refresh_tokens SET revoked_at=? WHERE id=? AND revoked_at IS NULL AND expires_at>?"
  ).bind(secs(),current.id,secs()).run();
  if((result.meta.changes??0)!==1)
    return apiError(401,"INVALID_REFRESH_TOKEN","Sesión expirada");
  const session=await issueSession(env,user);
  return response({accessToken:session.accessToken,refreshToken:session.refreshToken});
}
async function logout(request:Request,env:LabEnv):Promise<Response>{
  const body=await parseJSON(request);
  if(typeof body?.refreshToken==="string"&&body.refreshToken.length<256){
    const hash=await digest(body.refreshToken);
    await env.DB.prepare(
      "UPDATE refresh_tokens SET revoked_at=? WHERE token_hash=? AND id LIKE 'labrt_%' AND revoked_at IS NULL"
    ).bind(secs(),hash).run();
  }
  return new Response(null,{status:204,headers:{"Cache-Control":"no-store"}});
}
async function registerDevice(request:Request,env:LabEnv,user:LabUser):Promise<Response>{
  const body=await parseJSON(request);
  const raw=typeof body?.deviceName==="string"?body.deviceName:
       typeof body?.name==="string"?body.name:"Navegador";
  const name=raw.trim().slice(0,120)||"Navegador";
  const devId="labdev_"+crypto.randomUUID();
  const rowId="labdevrow_"+crypto.randomUUID();
  // Un solo statement atómico: impide superar el límite con solicitudes paralelas.
  const result=await env.DB.prepare(
    "INSERT INTO device_sessions(id,user_id,device_id,name,last_seen_at,active) "+
    "SELECT ?,id,?,?,?,1 FROM users WHERE id=? AND status='ACTIVE' AND "+
    "max_devices>(SELECT COUNT(*) FROM device_sessions WHERE user_id=? AND active=1)"
  ).bind(rowId,devId,name,secs(),user.id,user.id).run();
  if((result.meta.changes??0)!==1)
    return apiError(409,"DEVICE_LIMIT_REACHED","Alcanzaste el límite de dispositivos");
  const deviceToken=await new SignJWT({deviceId:devId,userId:user.id})
    .setProtectedHeader({alg:"HS256",typ:"JWT"})
    .setIssuer(issuer).setAudience("device").setIssuedAt()
    .sign(secret(env,"device"));
  return response({deviceToken,deviceId:devId},201);
}
export async function handleLabAuth(request:Request,env:LabEnv,url:URL):Promise<Response|undefined>{
  if(!url.pathname.startsWith("/api/auth/") && url.pathname!=="/api/devices/register")
    return undefined;
  // Las rutas auth/device nunca están disponibles para el público de workers.dev.
  if(!env.LAB_GATE_KEY||!env.LAB_JWT_SECRET)
    return apiError(503,"LAB_NOT_CONFIGURED","Autenticación LAB no configurada");
  const gate=request.headers.get("X-Lab-Key")||"";
  if(!sameBytes(gate,env.LAB_GATE_KEY))
    return apiError(404,"MIGRATION_LAB_ROUTE_DISABLED","Ruta no disponible");
  if(request.method==="POST"&&url.pathname==="/api/auth/login")return login(request,env);
  if(request.method==="POST"&&url.pathname==="/api/auth/refresh")return refresh(request,env);
  if(request.method==="POST"&&url.pathname==="/api/auth/logout")return logout(request,env);
  if(request.method==="GET"&&url.pathname==="/api/auth/me"){
    const user=await requireUser(request,env);
    if(!user)return apiError(401,"UNAUTHORIZED","Token inválido o expirado");
    return response(await toMe(env,user));
  }
  if(request.method==="POST"&&url.pathname==="/api/devices/register"){
    const user=await requireUser(request,env);
    if(!user)return apiError(401,"UNAUTHORIZED","Token inválido o expirado");
    return registerDevice(request,env,user);
  }
  return apiError(404,"MIGRATION_LAB_ROUTE_DISABLED","Ruta no disponible");
}
