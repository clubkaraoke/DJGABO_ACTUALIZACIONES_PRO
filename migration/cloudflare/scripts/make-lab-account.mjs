/**
 * Genera una cuenta de prueba EXCLUSIVAMENTE para la copia D1 del LAB.
 * Guarda SQL y credenciales en un directorio privado de la PC, no en GitHub.
 *
 * Uso: node make-lab-account.mjs DIR_PRIVADO ID_PLAN_ANUAL
 * Luego ejecutar el .sql PRIVADO con Wrangler D1 --remote --file.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
const output=process.argv[2];
const planId=process.argv[3];
if(!output||!/^plan_[a-zA-Z0-9_-]{8,90}$/.test(planId)){
  throw new Error("Uso: node make-lab-account.mjs DIR_PRIVADO ID_PLAN");
}
if(!fs.existsSync(output))throw new Error("Directorio privado no encontrado");
const id="labusr_"+crypto.randomUUID();
const email="cloudflare-lab-"+crypto.randomBytes(6).toString("hex")+"@example.invalid";
const password=crypto.randomBytes(30).toString("base64url");
const hash=await bcrypt.hash(password,12);
const now=Math.floor(Date.now()/1000),end=now+365*86400;
const quote=s=>"'"+String(s).replace(/'/g,"''")+"'";
const sql="INSERT INTO users ("+
 "id,email,password_hash,name,role,status,plan_id,subscription_start,subscription_end,"+
 "legacy_pending_expiry,max_devices,created_at,updated_at) VALUES ("+
 [quote(id),quote(email),quote(hash),quote("Cliente LAB Ficticio"),
  quote("MEMBER"),quote("ACTIVE"),quote(planId),now,end,0,3,now,now].join(",")+
 ");\n";
const sqlPath=path.join(output,"lab-test-account.sql");
const credsPath=path.join(output,"lab-test-credentials.json");
if(fs.existsSync(sqlPath)||fs.existsSync(credsPath))throw new Error("Archivo existente: no sobreescribir");
fs.writeFileSync(sqlPath,sql,{flag:"wx",mode:0o600});
fs.writeFileSync(credsPath,JSON.stringify({email,password,id,planId},null,2)+"\n",{flag:"wx",mode:0o600});
console.log(JSON.stringify({status:"READY",fakeAccountId:id,
 sqlFile:sqlPath,credentialsFile:credsPath,containsRealCustomers:false}));
