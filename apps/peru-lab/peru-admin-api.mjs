import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
const hash=x=>createHash('sha256').update(x).digest('hex');
const eq=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export function peruAdmin({db,send,readJson,adminSecret}){
 db.exec('CREATE TABLE IF NOT EXISTS peru_admin_sessions(token TEXT PRIMARY KEY,expires INTEGER NOT NULL)');
 const cookie=req=>String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('peru_admin='))?.slice(11)||'';
 const secure=req=>adminSecret.length>=16&&eq(req.headers['x-admin-password'],adminSecret);
 const sessionKey=t=>hash(adminSecret+'\0'+t);
 const session=req=>{const t=cookie(req);return adminSecret.length>=16&&/^[a-f0-9]{64}$/.test(t)&&!!db.prepare('SELECT 1 FROM peru_admin_sessions WHERE token=? AND expires>?').get(sessionKey(t),Date.now())};
 const set=(res,value,age)=>res.appendHeader('Set-Cookie',`peru_admin=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`);
 const count=(sql,...p)=>db.prepare(sql).get(...p).n;
 const handle=async(req,res,url)=>{const p=url.pathname,m=req.method;if(!p.startsWith('/api/admin/'))return false;
  if(req.headers['sec-fetch-site']==='cross-site'){send(res,403,{error:'ORIGIN_DENIED'});return true}
  if(p==='/api/admin/session'){
   if(m==='GET'){send(res,session(req)?200:403,session(req)?{authenticated:true}:{error:'ADMIN_AUTH_REQUIRED'});return true}
   if(m==='DELETE'){const t=cookie(req);if(/^[a-f0-9]{64}$/.test(t))db.prepare('DELETE FROM peru_admin_sessions WHERE token=?').run(sessionKey(t));set(res,'',0);send(res,200,{ok:true});return true}
   if(m==='POST'){const b=await readJson(req);if(adminSecret.length<16||!eq(b.password,adminSecret)){send(res,403,{error:'ADMIN_AUTH_REQUIRED'});return true}const t=randomBytes(32).toString('hex');db.prepare('DELETE FROM peru_admin_sessions WHERE expires<=?').run(Date.now());db.prepare('INSERT INTO peru_admin_sessions VALUES(?,?)').run(sessionKey(t),Date.now()+8*3600000);set(res,t,28800);send(res,200,{authenticated:true});return true}
   send(res,405,{error:'METHOD_NOT_ALLOWED'});return true;
  }
  // Existing separately authenticated endpoints continue to work; an authenticated
  // same-site browser session is normalized internally and never reveals the secret.
  if(session(req))req.headers['x-admin-password']=adminSecret;
  if(!p.startsWith('/api/admin/peru/'))return false;
  if(!secure(req)){send(res,403,{error:'ADMIN_AUTH_REQUIRED'});return true}if(m!=='GET'){send(res,405,{error:'METHOD_NOT_ALLOWED'});return true}
  const view=p.slice('/api/admin/peru/'.length);
  if(view==='dashboard'){
   const customers=count('SELECT COUNT(*) n FROM peru_customers'),tracks=count('SELECT COUNT(*) n FROM tracks'),approved=count("SELECT COUNT(*) n FROM peru_orders WHERE status='approved'"),pending=count("SELECT COUNT(*) n FROM peru_orders WHERE status='pending'"),testSales=count("SELECT COALESCE(SUM(amount),0) n FROM peru_orders WHERE status='approved' AND test=1"),sales=count("SELECT COALESCE(SUM(amount),0) n FROM peru_orders WHERE status='approved' AND test=0"),videos=count("SELECT COUNT(*) n FROM peru_mp4_cache WHERE status='approved'"),review=count("SELECT COUNT(*) n FROM peru_mp4_cache WHERE status='pending'");
   const recent=db.prepare('SELECT o.id,o.status,o.amount,o.test,o.created,c.name FROM peru_orders o JOIN peru_customers c ON c.id=o.customer ORDER BY o.created DESC LIMIT 10').all();const top=db.prepare('SELECT t.artist,t.title,r.plays FROM peru_demo_rank r JOIN tracks t ON t.id=r.track_id ORDER BY r.plays DESC LIMIT 10').all();send(res,200,{customers,tracks,approved,pending,testSales,sales,videos,review,recent,top});return true;
  }
  if(view==='clients'){const clients=db.prepare("SELECT c.id,c.email,c.name,c.test,c.created,(SELECT COUNT(*) FROM peru_orders o WHERE o.customer=c.id AND o.status='approved') AS orders,(SELECT COALESCE(SUM(o.amount),0) FROM peru_orders o WHERE o.customer=c.id AND o.status='approved') AS total FROM peru_customers c ORDER BY c.created DESC LIMIT 1000").all();send(res,200,{clients});return true}
  if(view==='downloads'){const rows=db.prepare("SELECT o.id orderId,c.name,i.artist,i.title,o.confirmed,o.test FROM peru_order_items i JOIN peru_orders o ON o.id=i.order_id JOIN peru_customers c ON c.id=o.customer WHERE o.status='approved' ORDER BY o.confirmed DESC LIMIT 1000").all();const videos=db.prepare("SELECT artist,title,size,updated FROM peru_mp4_cache WHERE status='approved' ORDER BY updated DESC LIMIT 500").all();send(res,200,{rows,videos});return true}
  if(view==='sync'){const n=count('SELECT COUNT(*) n FROM tracks'),covers=count("SELECT COUNT(*) n FROM tracks WHERE cover IS NOT NULL AND cover<>''"),ready=count("SELECT COUNT(*) n FROM tracks WHERE audio<>'' AND cdg<>''"),demos=count('SELECT COUNT(*) n FROM demo_cache'),lastSync=db.prepare("SELECT value FROM meta WHERE key='lastSync'").get()?.value??null;send(res,200,{n,covers,ready,demos,lastSync});return true}
  send(res,404,{error:'NOT_FOUND'});return true;
 };return handle;
}
