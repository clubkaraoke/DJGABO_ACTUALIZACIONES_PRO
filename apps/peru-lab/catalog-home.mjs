import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';

const DAY=86400000,MIN_LISTEN=5000,MAX_TICKET=30*60*1000;
const idPattern=/^PE-[a-f0-9]{24}$/;
const visitorPattern=/^[a-f0-9]{32}$/;
function eq(a,b){const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length&&timingSafeEqual(x,y)}
export function catalogHome({db,secret,clock=()=>Date.now()}){
  db.exec(`CREATE TABLE IF NOT EXISTS peru_demo_rank(track_id TEXT PRIMARY KEY, plays INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS peru_demo_daily(track_id TEXT NOT NULL, visitor TEXT NOT NULL, day INTEGER NOT NULL, PRIMARY KEY(track_id,visitor,day));
    CREATE INDEX IF NOT EXISTS peru_demo_daily_day ON peru_demo_daily(day);
    CREATE TABLE IF NOT EXISTS peru_catalog_first_seen(track_id TEXT PRIMARY KEY, added_at INTEGER NOT NULL);
    INSERT OR IGNORE INTO peru_catalog_first_seen SELECT id,0 FROM tracks;`);
  const sign=raw=>createHmac('sha256',secret).update(raw).digest('base64url');
  const visitor=req=>String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('peru_demo_visitor='))?.slice(18)||'';
  const identity=value=>createHmac('sha256',secret).update('demo-visitor:'+value).digest('hex');
  function ticket(req,res,id){
    let v=visitor(req);
    if(!visitorPattern.test(v)){v=randomBytes(16).toString('hex');res.appendHeader('Set-Cookie',`peru_demo_visitor=${v}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=31536000`)}
    const raw=Buffer.from(JSON.stringify({id,v:identity(v),at:clock()})).toString('base64url');
    return raw+'.'+sign(raw);
  }
  function record(req,token){
    if(typeof token!=='string'||token.length>512||req.headers['sec-fetch-site']==='cross-site')return {valid:false};
    let p;try{const [raw,mac,extra]=token.split('.');if(extra||!raw||!mac||!eq(mac,sign(raw)))return {valid:false};p=JSON.parse(Buffer.from(raw,'base64url').toString('utf8'))}catch{return {valid:false}}
    const v=visitor(req),now=clock(),day=Math.floor(now/DAY);
    if(!idPattern.test(p.id)||!visitorPattern.test(v)||!eq(p.v,identity(v))||!Number.isFinite(p.at)||now-p.at<MIN_LISTEN||now-p.at>MAX_TICKET||!db.prepare('SELECT id FROM tracks WHERE id=?').get(p.id))return {valid:false};
    db.exec('BEGIN IMMEDIATE');try{
      db.prepare('DELETE FROM peru_demo_daily WHERE day<?').run(day-1);
      const counted=!!db.prepare('INSERT OR IGNORE INTO peru_demo_daily VALUES(?,?,?)').run(p.id,p.v,day).changes;
      if(counted)db.prepare('INSERT INTO peru_demo_rank VALUES(?,1) ON CONFLICT(track_id) DO UPDATE SET plays=plays+1').run(p.id);
      db.exec('COMMIT');return {valid:true,counted};
    }catch(e){db.exec('ROLLBACK');throw e}
  }
  const fields='t.id,t.artist,t.title,t.cover,t.format';
  const home=()=>({top:db.prepare(`SELECT ${fields} FROM tracks t JOIN peru_demo_rank r ON r.track_id=t.id WHERE r.plays>0 AND t.audio<>'' AND t.cdg<>'' ORDER BY r.plays DESC,t.position ASC LIMIT 10`).all(),recent:db.prepare(`SELECT ${fields} FROM tracks t LEFT JOIN peru_catalog_first_seen f ON f.track_id=t.id ORDER BY COALESCE(f.added_at,0) DESC,t.position ASC LIMIT 18`).all()});
  const registerNew=()=>db.prepare('INSERT OR IGNORE INTO peru_catalog_first_seen SELECT id,? FROM tracks').run(clock());
  return {ticket,record,home,registerNew};
}
