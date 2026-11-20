import {commerce} from './commerce.mjs';
import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const db=new DatabaseSync(':memory:');
db.exec('CREATE TABLE tracks(id TEXT PRIMARY KEY,artist TEXT,title TEXT,format TEXT,audio TEXT,cdg TEXT)');
const ids=[1,2,3,4,5,6].map(i=>'PE-'+i.toString(16).padStart(24,'0'));
for(const id of ids)db.prepare('INSERT INTO tracks VALUES(?,?,?,?,?,?)').run(id,'Artista','Canción','WAV+CDG','/private.wav','/private.cdg');
const adminSecret='fake-admin-password-123';let price=1500;
const send=(res,code,data)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(data))};
const readJson=async req=>{let b=[];for await(const x of req)b.push(x);return JSON.parse(Buffer.concat(b))};
const handle=commerce({db,send,readJson,settings:()=>({paymentMethods:{yape:true}}),quoteCart:ids=>({qty:new Set(ids).size,totalCents:new Set(ids).size*price,unitPriceCents:price}),dropboxOpen:async()=>new Response('example'),adminSecret});
const server=http.createServer(async(req,res)=>{if(!await handle(req,res,new URL(req.url,'http://localhost')))send(res,404,{})});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const img=(color)=>{const r=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i',`color=c=${color}:s=150x150`,'-frames:v','1','-threads','1','-f','image2pipe','-vcodec','mjpeg','pipe:1']);assert.equal(r.status,0,r.stderr.toString());return r.stdout};
async function request(p,{u,method='GET',body,admin=false,headers={},status=200}={}){const r=await fetch(base+p,{method,headers:{...(u?{Cookie:u.cookie,'X-CSRF-Token':u.csrf}:{}),...(admin?{'X-Admin-Password':adminSecret}:{}),...(body&&!Buffer.isBuffer(body)?{'Content-Type':'application/json'}:{}),...headers},body:Buffer.isBuffer(body)?body:body?JSON.stringify(body):undefined});assert.equal(r.status,status,p+' '+(r.status!==status?await r.text():''));return r}
const login=async()=>{const r=await request('/api/customer/test-login',{method:'POST',headers:{'X-Lab-Test':'1'}});const cookie=r.headers.get('set-cookie').split(';')[0];const j=await (await request('/api/customer/me',{u:{cookie,csrf:''}})).json();return {cookie,csrf:j.user.csrf}};
try{
const a=await login(),b=await login();await request('/api/admin/orders',{status:403});await request('/api/orders',{method:'POST',body:{ids:ids.slice(0,5)},status:401});
const order=await (await request('/api/orders',{u:a,method:'POST',body:{ids:ids.slice(0,5)}})).json();assert.equal(order.amount,7500);assert.equal(order.qty,5);assert.ok(order.expires-order.created===99000);assert.ok(!JSON.stringify(order).includes('/private'));
await request('/api/orders/'+order.id,{u:b,status:404});await request('/api/my-karaokes/'+ids[0]+'/audio',{u:a,status:404});
const same=await(await request('/api/orders',{u:a,method:'POST',body:{ids:ids.slice(0,5).reverse()}})).json();assert.equal(same.id,order.id);
const other=await(await request('/api/orders',{u:b,method:'POST',body:{ids:[ids[0]]}})).json();price=1;const image=img('red');
await request('/api/orders/'+order.id+'/receipt',{u:a,method:'POST',body:Buffer.from('bad'),status:422});
await request('/api/orders/'+order.id+'/receipt',{u:a,method:'POST',body:image});await request('/api/orders/'+other.id+'/receipt',{u:b,method:'POST',body:image,status:409});const adminOrders=await(await request('/api/admin/orders',{admin:true})).json();const receipt=adminOrders.orders.find(o=>o.id===order.id).receipts[0];await request('/api/admin/orders/'+order.id+'/receipt/'+receipt.id,{admin:true});
await request('/api/admin/orders/'+order.id+'/review',{admin:true,method:'POST',body:{action:'approve',reference:'TEST-001',amount:5,confirmed:true},status:422});
await request('/api/admin/orders/'+order.id+'/review',{admin:true,method:'POST',body:{action:'resubmit'}});await request('/api/orders/'+order.id+'/receipt',{u:a,method:'POST',body:img('green')});
await request('/api/admin/orders/'+order.id+'/review',{admin:true,method:'POST',body:{action:'approve',reference:'TEST-001',amount:7500,confirmed:true}});await request('/api/admin/orders/'+order.id+'/review',{admin:true,method:'POST',body:{action:'approve',reference:'TEST-001',amount:7500,confirmed:true}});
const owned=await(await request('/api/my-karaokes',{u:a})).json();assert.equal(owned.items.length,5);const download=await request('/api/my-karaokes/'+ids[0]+'/audio',{u:a});assert.equal(await download.text(),'example');await request('/api/my-karaokes/'+ids[0]+'/audio',{u:b,status:404});await request('/api/orders/'+other.id+'/receipt',{u:b,method:'POST',body:img('blue')});await request('/api/admin/orders/'+other.id+'/review',{admin:true,method:'POST',body:{action:'approve',reference:'TEST-001',amount:1500,confirmed:true},status:409});await request('/api/admin/orders/'+other.id+'/review',{admin:true,method:'POST',body:{action:'reject',reason:'Prueba'}});
console.log('PASS: login, owner isolation, 99s, frozen amount, image validation, duplicate receipt and operation, resubmit, approve idempotency, reject, purchases, protected downloads');
}finally{server.close()}
