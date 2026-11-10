#!/usr/bin/env node
"use strict";
// Seed EXCLUSIVAMENTE sintético. Nunca inserta clientes reales.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
const dir = process.argv[2];
const privateDir=process.argv[3];
if(!dir||!privateDir)throw new Error("Uso: node seed-local-fixture.mjs WORKER_DIR PRIVATE_DIR");
const sql=path.join(dir,"lab-local-seed.sql");
const vars=path.join(dir,".dev.vars");
const creds=path.join(privateDir,"lab-local-credentials.json");
for(const file of [sql,vars,creds])if(fs.existsSync(file))throw new Error("Archivo existe; no sobreescribir: "+path.basename(file));
const quote=s=>"'"+String(s).replace(/'/g,"''")+"'";
const now=Math.floor(Date.now()/1000);
const fakeId="labusr_"+crypto.randomUUID();
const email="cloudflare-fixture-"+crypto.randomBytes(6).toString("hex")+"@example.invalid";
const password=crypto.randomBytes(30).toString("base64url");
const hash=await bcrypt.hash(password,12);
const gate=crypto.randomBytes(48).toString("base64url");
const jwt=crypto.randomBytes(48).toString("base64url");
const planId="plan_fixture_anual",collectionId="col_fixture_2026_09";
const statements=[
 "INSERT INTO plans (id,name,slug,active,max_devices,created_at,updated_at) VALUES ("+
   [quote(planId),quote("Plan Anual LAB"),quote("pro-anual"),1,3,now,now].join(",")+");",
 "INSERT INTO users (id,email,password_hash,name,role,status,plan_id,subscription_start,subscription_end,"+
  "legacy_pending_expiry,max_devices,created_at,updated_at) VALUES ("+
  [quote(fakeId),quote(email),quote(hash),quote("Cliente ficticio"),quote("MEMBER"),quote("ACTIVE"),
   quote(planId),now,now+365*86400,0,3,now,now].join(",")+");",
 "INSERT INTO collections (id,slug,title,year,month,storage_path,published_at,updated_at,created_at,active,sort_order) VALUES ("+
  [quote(collectionId),quote("2026-09"),quote("Septiembre LAB"),2026,9,
   quote("/lab/catalog/2026/09"),now,now,now,1,0].join(",")+");"
];
fs.writeFileSync(sql,statements.join("\n")+"\n",{mode:0o600,flag:"wx"});
fs.writeFileSync(vars,"LAB_GATE_KEY="+gate+"\nLAB_JWT_SECRET="+jwt+"\n",{mode:0o600,flag:"wx"});
fs.writeFileSync(creds,JSON.stringify({email,password,id:fakeId,planId,collectionId,gate},null,2)+"\n",{mode:0o600,flag:"wx"});
console.log(JSON.stringify({status:"LOCAL_SYNTHETIC_FIXTURE_READY",sqlFile:sql,createdUser:true,realCustomerRows:0}));
