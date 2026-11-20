import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {spawn} from 'node:child_process';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';

const rand=()=>randomBytes(32).toString('hex');
const hash=v=>createHash('sha256').update(v).digest('hex');
const eq=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const now=()=>Date.now();
const err=(status,code)=>Object.assign(Error(code),{status});
const origin=process.env.PERU_PUBLIC_ORIGIN||'https://djgabo-tienda-peru-lab-production.up.railway.app';
const redirect=origin+'/api/customer/google/callback';
const googleReady=()=>!!(process.env.PERU_GOOGLE_CLIENT_ID&&process.env.PERU_GOOGLE_CLIENT_SECRET);
const cookie=(req,name)=>String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1)||'';
const setCookie=(res,name,value,age)=>res.appendHeader('Set-Cookie',`${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`);
const jump=(res,url)=>{res.writeHead(303,{Location:url,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});res.end()};
const MAX=10*1024*1024;
async function receiptBytes(req){let size=0,chunks=[];for await(const b of req){size+=b.length;if(size>MAX)throw err(413,'RECEIPT_TOO_LARGE');chunks.push(b)}const raw=Buffer.concat(chunks);const png=raw.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));const jpg=raw[0]===255&&raw[1]===216;const webp=raw.subarray(0,4).toString()==='RIFF'&&raw.subarray(8,12).toString()==='WEBP';if(!png&&!jpg&&!webp)throw err(422,'INVALID_RECEIPT');return raw}
async function normalizeReceipt(raw){return new Promise((resolve,reject)=>{const p=spawn('ffmpeg',['-hide_banner','-loglevel','error','-threads','1','-f','image2pipe','-i','pipe:0','-frames:v','1','-vf',"scale='min(1600,iw)':'min(1600,ih)':force_original_aspect_ratio=decrease",'-map_metadata','-1','-f','image2pipe','-vcodec','mjpeg','pipe:1'],{stdio:['pipe','pipe','ignore']});let n=0,out=[];const timer=setTimeout(()=>p.kill('SIGKILL'),10000);p.stdout.on('data',b=>{n+=b.length;if(n>MAX)p.kill('SIGKILL');else out.push(b)});p.stdin.on('error',()=>{});p.on('error',()=>{clearTimeout(timer);reject(err(422,'INVALID_RECEIPT'))});p.on('close',c=>{clearTimeout(timer);if(c!==0||!n||n>MAX)reject(err(422,'INVALID_RECEIPT'));else resolve(Buffer.concat(out))});p.stdin.end(raw)})}

export function commerce({db,send,readJson,settings,quoteCart,dropboxOpen,adminSecret,dropboxTemporaryLink,deliveryOrigin=process.env.PERU_DELIVERY_ORIGIN||'',deliverySecret=process.env.PERU_DELIVERY_SECRET||''}){
 db.exec(`CREATE TABLE IF NOT EXISTS peru_customers (id TEXT PRIMARY KEY, email TEXT, name TEXT NOT NULL, test INTEGER NOT NULL, created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS peru_sessions(token TEXT PRIMARY KEY, customer TEXT NOT NULL, csrf TEXT NOT NULL, expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS peru_oauth(state TEXT PRIMARY KEY, verifier TEXT NOT NULL, expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS peru_orders(id TEXT PRIMARY KEY, customer TEXT NOT NULL, amount INTEGER NOT NULL, qty INTEGER NOT NULL, unit INTEGER NOT NULL, status TEXT NOT NULL, test INTEGER NOT NULL, created INTEGER NOT NULL, expires INTEGER NOT NULL, operation TEXT UNIQUE, reason TEXT, confirmed INTEGER, updated INTEGER NOT NULL, receipt_state TEXT, receipt_count INTEGER DEFAULT 0);
 CREATE TABLE IF NOT EXISTS peru_order_items(order_id TEXT NOT NULL, track_id TEXT NOT NULL, artist TEXT NOT NULL, title TEXT NOT NULL, format TEXT NOT NULL, audio TEXT NOT NULL, cdg TEXT NOT NULL, PRIMARY KEY(order_id,track_id));
 CREATE TABLE IF NOT EXISTS peru_receipts(id TEXT PRIMARY KEY, order_id TEXT NOT NULL, digest TEXT NOT NULL, image BLOB NOT NULL, created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS peru_video_tickets(token TEXT PRIMARY KEY, session TEXT NOT NULL, track_id TEXT NOT NULL, expires INTEGER NOT NULL, audio_used INTEGER NOT NULL DEFAULT 0, cdg_used INTEGER NOT NULL DEFAULT 0);
 CREATE INDEX IF NOT EXISTS peru_receipt_digest ON peru_receipts(digest); CREATE INDEX IF NOT EXISTS peru_order_customer ON peru_orders(customer);`);
 const transaction=f=>{db.exec('BEGIN IMMEDIATE');try{const v=f();db.exec('COMMIT');return v}catch(e){db.exec('ROLLBACK');throw e}};
 const session=req=>db.prepare('SELECT c.id,c.name,c.email,c.test,s.csrf FROM peru_sessions s JOIN peru_customers c ON c.id=s.customer WHERE s.token=? AND s.expires>?').get(hash(cookie(req,'peru_session')),now());
 const requireUser=req=>{const u=session(req);if(!u)throw err(401,'LOGIN_REQUIRED');return u};
 const csrf=(req,u)=>{if(!eq(req.headers['x-csrf-token'],u.csrf))throw err(403,'CSRF_REQUIRED')};
 const admin=req=>{if(adminSecret.length<16||!eq(req.headers['x-admin-password'],adminSecret))throw err(403,'ADMIN_AUTH_REQUIRED')};
 const order=(id,u)=>{const o=db.prepare('SELECT * FROM peru_orders WHERE id=?').get(id);if(!o||u&&o.customer!==u.id)throw err(404,'ORDER_NOT_FOUND');return o};
 const items=id=>db.prepare('SELECT track_id AS id,artist,title,format FROM peru_order_items WHERE order_id=?').all(id);
 const view=o=>({id:o.id,amount:o.amount,qty:o.qty,unit:o.unit,status:o.status==='waiting'&&o.expires<now()?'expired':o.status,test:!!o.test,created:o.created,expires:o.expires,reason:o.reason,receiptState:o.receipt_state,receiptCount:o.receipt_count,items:items(o.id)});
 const addSession=(res,id)=>{const token=rand(),csrf=rand();db.prepare('DELETE FROM peru_sessions WHERE expires<?').run(now());db.prepare('INSERT INTO peru_sessions VALUES(?,?,?,?)').run(hash(token),id,csrf,now()+7*86400000);setCookie(res,'peru_session',token,604800)};
 const owned=(u,id)=>db.prepare("SELECT i.* FROM peru_order_items i JOIN peru_orders o ON o.id=i.order_id WHERE o.customer=? AND o.status='approved' AND i.track_id=? ORDER BY o.confirmed DESC LIMIT 1").get(u.id,id);
 const list=u=>db.prepare('SELECT * FROM peru_orders WHERE customer=? ORDER BY created DESC LIMIT 100').all(u.id).map(view);
 const testMode=true; // Private LAB: never produces a valid payment QR or collects money.
 return async(req,res,url)=>{
 const p=url.pathname,m=req.method;
 if(!/^\/api\/(customer|orders|my-karaokes|admin\/orders)(\/|$)/.test(p)&&p!=='/api/internal/peru/delivery/redeem')return false;
 try{
 if(p==='/api/internal/peru/delivery/redeem'){
   if(m!=='POST'||!deliveryOrigin||deliverySecret.length<32||!eq(req.headers['x-delivery-secret'],deliverySecret)||typeof dropboxTemporaryLink!=='function')throw err(403,'DELIVERY_AUTH_REQUIRED');
   const {ticket,id,kind}=await readJson(req);if(typeof ticket!=='string'||!/^[a-f0-9]{64}$/.test(ticket)||typeof id!=='string'||!/^PE-[a-f0-9]{24}$/.test(id)||!['audio','cdg'].includes(kind))throw err(400,'DELIVERY_INVALID');
   const file=transaction(()=>{const token=hash(ticket),ts=now();const row=db.prepare('SELECT v.*,s.customer FROM peru_video_tickets v JOIN peru_sessions s ON s.token=v.session AND s.expires>? WHERE v.token=? AND v.track_id=? AND v.expires>?').get(ts,token,id,ts);const col=kind==='audio'?'audio_used':'cdg_used';if(!row||row[col])throw err(403,'VIDEO_TICKET_INVALID');const t=owned({id:row.customer},id);if(!t)throw err(404,'PURCHASE_REQUIRED');if(!db.prepare(`UPDATE peru_video_tickets SET ${col}=1 WHERE token=? AND ${col}=0`).run(token).changes)throw err(403,'VIDEO_TICKET_INVALID');return kind==='audio'?t.audio:t.cdg});
   const link=await dropboxTemporaryLink(file);send(res,200,{link});return true;
 }
 if(p==='/api/customer/me'&&m==='GET'){const u=session(req);send(res,200,{user:u||null,googleReady:googleReady(),testMode});return true}
 if(p==='/api/customer/test-login'&&m==='POST'){
   if(req.headers['x-lab-test']!=='1')throw err(403,'LAB_ONLY');
   let u=session(req);if(!u){const id='test-'+rand();db.prepare('INSERT INTO peru_customers VALUES(?,?,?,?,?)').run(id,null,'Cliente de prueba',1,now());addSession(res,id)}send(res,200,{ok:true});return true;
 }
 if(p==='/api/customer/logout'&&m==='POST'){const u=requireUser(req);csrf(req,u);db.prepare('DELETE FROM peru_sessions WHERE token=?').run(hash(cookie(req,'peru_session')));setCookie(res,'peru_session','',0);send(res,200,{ok:true});return true}
 if(p==='/api/customer/google/start'&&m==='GET'){
   if(!googleReady())throw err(503,'GOOGLE_NOT_CONFIGURED');const state=rand(),verifier=rand();db.prepare('DELETE FROM peru_oauth WHERE expires<?').run(now());db.prepare('INSERT INTO peru_oauth VALUES(?,?,?)').run(hash(state),verifier,now()+600000);setCookie(res,'peru_oauth',state,600);
   jump(res,'https://accounts.google.com/o/oauth2/v2/auth?'+new URLSearchParams({client_id:process.env.PERU_GOOGLE_CLIENT_ID,redirect_uri:redirect,response_type:'code',scope:'openid email profile',state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',prompt:'select_account'}));return true;
 }
 if(p==='/api/customer/google/callback'&&m==='GET'){
   const state=url.searchParams.get('state'),code=url.searchParams.get('code');if(!googleReady()||!code||!eq(state,cookie(req,'peru_oauth')))throw err(400,'INVALID_OAUTH');const row=transaction(()=>{const r=db.prepare('SELECT * FROM peru_oauth WHERE state=? AND expires>?').get(hash(state),now());db.prepare('DELETE FROM peru_oauth WHERE state=?').run(hash(state));return r});setCookie(res,'peru_oauth','',0);if(!row)throw err(400,'INVALID_OAUTH');
   const token=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({code,client_id:process.env.PERU_GOOGLE_CLIENT_ID,client_secret:process.env.PERU_GOOGLE_CLIENT_SECRET,redirect_uri:redirect,grant_type:'authorization_code',code_verifier:row.verifier}),signal:AbortSignal.timeout(15000)});if(!token.ok)throw err(401,'GOOGLE_TOKEN_FAILED');const t=await token.json();const r=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:'Bearer '+t.access_token},signal:AbortSignal.timeout(15000)});if(!r.ok)throw err(401,'GOOGLE_IDENTITY_FAILED');const g=await r.json();if(!g.sub||!g.email||g.email_verified!==true)throw err(401,'GOOGLE_IDENTITY_FAILED');const id='google-'+hash(g.sub);db.prepare('INSERT INTO peru_customers VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,name=excluded.name').run(id,g.email,String(g.name||g.email).slice(0,200),0,now());addSession(res,id);jump(res,'/checkout');return true;
 }
 if(p==='/api/orders'&&m==='GET'){send(res,200,{orders:list(requireUser(req))});return true}
 if(p==='/api/orders'&&m==='POST'){
   const u=requireUser(req);csrf(req,u);if(!settings().paymentMethods.yape)throw err(409,'YAPE_DISABLED');const {ids}=await readJson(req);let q;try{q=quoteCart(ids)}catch{throw err(400,'INVALID_CART')}if(!q.qty)throw err(400,'EMPTY_CART');const unique=[...new Set(ids)].sort();
   const result=transaction(()=>{const ts=now();if(db.prepare('SELECT count(*) n FROM peru_orders WHERE customer=? AND created>?').get(u.id,ts-900000).n>=20)throw err(429,'TOO_MANY_ORDERS');const rows=unique.map(id=>db.prepare('SELECT * FROM tracks WHERE id=?').get(id));if(rows.some(r=>!r?.audio||!r?.cdg))throw err(409,'TRACK_UNAVAILABLE');if(unique.some(id=>owned(u,id)))throw err(409,'ALREADY_PURCHASED');const prior=db.prepare("SELECT * FROM peru_orders WHERE customer=? AND status IN ('waiting','pending') ORDER BY created DESC LIMIT 30").all(u.id).find(o=>JSON.stringify(items(o.id).map(x=>x.id).sort())===JSON.stringify(unique));if(prior&&(prior.status==='pending'||prior.expires>ts))return prior;const id=rand();db.prepare("INSERT INTO peru_orders(id,customer,amount,qty,unit,status,test,created,expires,updated) VALUES(?,?,?,?,?,'waiting',1,?,?,?)").run(id,u.id,q.totalCents,q.qty,q.unitPriceCents,ts,ts+99000,ts);for(const r of rows)db.prepare('INSERT INTO peru_order_items VALUES(?,?,?,?,?,?,?)').run(id,r.id,r.artist,r.title,r.format,r.audio,r.cdg);return order(id)});send(res,200,view(result));return true;
 }
 const match=/^\/api\/orders\/([a-f0-9]{64})(\/receipt)?$/.exec(p);
 if(match){const u=requireUser(req),o=order(match[1],u);if(m==='GET'&&!match[2]){send(res,200,view(o));return true}if(m==='POST'&&match[2]){csrf(req,u);if(o.status==='approved'||o.status==='rejected')throw err(409,'ORDER_CLOSED');if(o.status==='pending'&&o.receipt_state!=='resubmit')throw err(409,'ALREADY_RECEIVED');if(o.receipt_count>=5)throw err(429,'RECEIPT_LIMIT');const raw=await receiptBytes(req),digest=hash(raw),image=await normalizeReceipt(raw);transaction(()=>{const latest=order(o.id,u);if(!['waiting','pending'].includes(latest.status)||(latest.status==='pending'&&latest.receipt_state!=='resubmit')||latest.receipt_count>=5)throw err(409,'ORDER_CLOSED');if(db.prepare('SELECT 1 FROM peru_receipts WHERE digest=? AND order_id<>?').get(digest,o.id))throw err(409,'DUPLICATE_RECEIPT');db.prepare('INSERT INTO peru_receipts VALUES(?,?,?,?,?)').run(rand(),o.id,digest,image,now());db.prepare("UPDATE peru_orders SET status='pending',receipt_state='received',receipt_count=receipt_count+1,updated=? WHERE id=?").run(now(),o.id)});send(res,200,view(order(o.id,u)));return true}}
 if(p==='/api/admin/orders'&&m==='GET'){admin(req);const orders=db.prepare('SELECT o.*,c.name,c.email FROM peru_orders o JOIN peru_customers c ON c.id=o.customer ORDER BY CASE o.status WHEN \'pending\' THEN 0 ELSE 1 END,o.created DESC LIMIT 200').all().map(o=>({...view(o),name:o.name,email:o.email,receipts:db.prepare('SELECT id,created FROM peru_receipts WHERE order_id=? ORDER BY created DESC').all(o.id)}));send(res,200,{orders});return true}
 const ar=/^\/api\/admin\/orders\/([a-f0-9]{64})(?:\/(review|receipt)\/??([a-f0-9]{64})?)?$/.exec(p);
 if(ar){admin(req);const o=order(ar[1]);if(m==='GET'&&ar[2]==='receipt'&&ar[3]){const r=db.prepare('SELECT image FROM peru_receipts WHERE id=? AND order_id=?').get(ar[3],o.id);if(!r)throw err(404,'NOT_FOUND');res.writeHead(200,{'Content-Type':'image/jpeg','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});res.end(Buffer.from(r.image));return true}if(m==='POST'&&ar[2]==='review'){const b=await readJson(req);transaction(()=>{const latest=order(o.id);if(latest.status==='approved'&&b.action==='approve')return;if(latest.status!=='pending')throw err(409,'NOT_PENDING');if(b.action==='approve'){
   // Same receipt review convention as Studio: manual confirmation in Yape, optional operation reference.
   const receipt=db.prepare('SELECT id FROM peru_receipts WHERE order_id=? ORDER BY created DESC,rowid DESC LIMIT 1').get(o.id);
   if(!receipt||b.receiptId&&b.receiptId!==receipt.id)throw err(409,'RECEIPT_CHANGED');
   const supplied=String(b.reference||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
   const ref=supplied||'CPB'+o.id.toUpperCase();
   if(ref.length<4||ref.length>80||b.amount!==undefined&&b.amount!==latest.amount||b.confirmed!==true||!latest.test)throw err(422,'VERIFY_AMOUNT_AND_REFERENCE');
   if(db.prepare('SELECT 1 FROM peru_orders WHERE operation=? AND id<>?').get(ref,o.id))throw err(409,'DUPLICATE_OPERATION');
   db.prepare("UPDATE peru_orders SET status='approved',operation=?,confirmed=?,updated=? WHERE id=?").run(ref,now(),now(),o.id)
 }else if(b.action==='resubmit'){db.prepare("UPDATE peru_orders SET receipt_state='resubmit',updated=? WHERE id=?").run(now(),o.id)}else if(b.action==='reject'&&typeof b.reason==='string'&&b.reason.trim()&&b.reason.length<=500){db.prepare("UPDATE peru_orders SET status='rejected',reason=?,updated=? WHERE id=?").run(b.reason.trim(),now(),o.id)}else throw err(422,'INVALID_REVIEW')});send(res,200,view(order(o.id)));return true}}
 if(p==='/api/my-karaokes'&&m==='GET'){const u=requireUser(req);const rows=db.prepare("SELECT i.track_id AS id,i.artist,i.title,i.format,MAX(o.confirmed) purchased FROM peru_order_items i JOIN peru_orders o ON o.id=i.order_id WHERE o.customer=? AND o.status='approved' GROUP BY i.track_id ORDER BY purchased DESC").all(u.id);send(res,200,{items:rows});return true}
 const d=/^\/api\/my-karaokes\/(PE-[a-f0-9]{24})\/video(?:\/(audio|cdg))?$/.exec(p);
 if(d){const u=requireUser(req),t=owned(u,d[1]);if(!t)throw err(404,'PURCHASE_REQUIRED');const sid=hash(cookie(req,'peru_session'));
   if(m==='POST'&&!d[2]){csrf(req,u);const ticket=rand();transaction(()=>{db.prepare('DELETE FROM peru_video_tickets WHERE expires<? OR (session=? AND track_id=?)').run(now(),sid,d[1]);db.prepare('INSERT INTO peru_video_tickets(token,session,track_id,expires) VALUES(?,?,?,?)').run(hash(ticket),sid,d[1],now()+300000)});send(res,200,{ticket,...(deliveryOrigin?{deliveryUrl:deliveryOrigin+'/peru/'+d[1]}:{})});return true}
   if(m==='GET'&&d[2]){if(deliveryOrigin)throw err(409,'DELIVERY_WORKER_REQUIRED');const ticket=req.headers['x-conversion-ticket'];if(typeof ticket!=='string'||!/^[a-f0-9]{64}$/.test(ticket))throw err(403,'VIDEO_TICKET_REQUIRED');const col=d[2]==='audio'?'audio_used':'cdg_used';const used=db.prepare(`UPDATE peru_video_tickets SET ${col}=1 WHERE token=? AND session=? AND track_id=? AND expires>? AND ${col}=0`).run(hash(ticket),sid,d[1],now());if(!used.changes)throw err(403,'VIDEO_TICKET_INVALID');const file=d[2]==='audio'?t.audio:t.cdg;const response=await dropboxOpen(file);const length=response.headers.get('content-length');res.writeHead(200,{'Content-Type':'application/octet-stream',...(length&&/^\d+$/.test(length)?{'Content-Length':length}:{}),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});await pipeline(Readable.fromWeb(response.body),res);return true}
 }
 throw err(404,'NOT_FOUND');
 }catch(e){if(!res.headersSent)send(res,e.status||500,{error:e.status?e.message:'COMMERCE_ERROR'});else res.destroy();return true}
 };
}
