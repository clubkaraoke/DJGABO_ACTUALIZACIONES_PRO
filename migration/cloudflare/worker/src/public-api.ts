/**
 * API pública compatible con Railway, consultando D1.
 * Únicamente devuelve DTO públicos, nunca rutas Dropbox ni credenciales.
 */
export interface PublicEnv { DB:D1Database }
interface Collection {
  id:string;slug:string;title:string;year:number;month:number;description:string|null;
  cover_url:string|null;storage_path:string;published_at:number|null;
  updated_at:number;active:number;sort_order:number;karaoke_count:number;
}
interface Karaoke {
  id:string;title:string;artist:string;code:string;genre:string|null;year:number|null;
  format:string|null;size:number|null;cover_url:string|null;collection_id:string;
  master_asset_id:string|null;preview_asset_id:string|null;published_at:number|null;
  created_at:number;asset_file_name:string|null;asset_size:number|null;
  storage_key:string|null;collection_path?:string;
}
function json(data:unknown,status=200):Response {
  return Response.json(data,{status,headers:{
    "Access-Control-Allow-Origin":"*","X-Content-Type-Options":"nosniff",
    "Cache-Control":"public, max-age=10, stale-while-revalidate=30"
  }});
}
function error(status:number,code:string):Response {
  return Response.json({error:code,message:"Solicitud inválida",statusCode:status},{
    status,headers:{"Cache-Control":"no-store","Access-Control-Allow-Origin":"*"}
  });
}
function iso(ts:number|null):string|null {return ts===null?null:new Date(ts*1000).toISOString();}
function summary(c:Collection,n:number){
  return {id:c.id,slug:c.slug,title:c.title,year:c.year,month:c.month,
    description:c.description,coverUrl:c.cover_url,karaokeCount:c.active?n:0,
    updatedAt:iso(c.updated_at),publishedAt:iso(c.published_at),
    locked:false,preparing:!Boolean(c.active)};
}
const months:Array<[number,string[]]>=[
  [1,["ENERO","JANUARY"]],[2,["FEBRERO","FEBRUARY"]],[3,["MARZO","MARCH"]],
  [4,["ABRIL","APRIL"]],[5,["MAYO","MAY"]],[6,["JUNIO","JUNE"]],
  [7,["JULIO","JULY"]],[8,["AGOSTO","AUGUST"]],[9,["SEPTIEMBRE","SEPTEMBER"]],
  [10,["OCTUBRE","OCTOBER"]],[11,["NOVIEMBRE","NOVEMBER"]],[12,["DICIEMBRE","DECEMBER"]]
];
function parseYear(s:string):number|null{
  const m=s.trim().match(/(?:^|\D)(20\d{2})(?:\D|$)/);
  return m?Number(m[1]):null;
}
function parseMonth(s:string):number|null{
  const upper=s.trim().toUpperCase();
  for(const [n,names] of months)if(names.some(name=>upper.includes(name)))return n;
  const m=upper.match(/^(\d{1,2})/);
  if(m){const n=Number(m[1]);if(n>=1&&n<=12)return n;}
  return null;
}
function sourceGroup(storage:string|null,base:string):string|null{
  if(!storage)return null;
  const key=storage.replace(/\\/g,"/");
  const root=base.replace(/\\/g,"/").replace(/\/+$/,"");
  if(key.startsWith(root+"/")){
    const rel=key.slice(root.length+1).split("/").filter(Boolean);
    return rel.length>=2?rel[0]:null;
  }
  const dirs=root.split("/").filter(Boolean);
  let target:null|{year:number;month:number}=null;
  for(let i=0;i<dirs.length-1;i++){
    const y=parseYear(dirs[i]),m=parseMonth(dirs[i+1]);
    if(y!==null&&m!==null){target={year:y,month:m};break;}
  }
  if(!target)return null;
  const parts=key.split("/").filter(Boolean);
  for(let i=0;i<parts.length-1;i++){
    if(parseYear(parts[i])===target.year&&parseMonth(parts[i+1])===target.month){
      return i+2<parts.length-1?parts[i+2]??null:null;
    }
  }
  return null;
}
function club(group:string|null):boolean {
  if(!group)return false;
  const s=group.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()
    .replace(/[_./-]+/g," ").replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ");
  return s.includes("club karaoke")||s.includes("el club karaoke")||s.includes("prod club");
}
function karaokeDto(k:Karaoke,base:string){
  const group=sourceGroup(k.storage_key,base);
  const filename=k.asset_file_name??"";
  const dot=filename.lastIndexOf(".");
  return {id:k.id,title:k.title,artist:k.artist,code:k.code,genre:k.genre,
    year:k.year,format:k.format??(dot<0?null:filename.slice(dot+1).toUpperCase()),
    size:k.size??k.asset_size??null,coverUrl:k.cover_url,collectionId:k.collection_id,
    hasPreview:Boolean(k.preview_asset_id),demoAvailable:Boolean(k.master_asset_id)&&club(group),
    hasMaster:Boolean(k.master_asset_id),publishedAt:iso(k.published_at),sourceGroup:group};
}
const baseCollectionSql="SELECT c.id,c.slug,c.title,c.year,c.month,c.description,c.cover_url,"+
  "c.storage_path,c.published_at,c.updated_at,c.active,c.sort_order,"+
  "(SELECT COUNT(*) FROM karaokes k INNER JOIN assets a ON a.id=k.master_asset_id "+
  "WHERE k.collection_id=c.id AND k.catalog_active=1 AND a.provider='dropbox') AS karaoke_count "+
  "FROM collections c";
const karaokeProjection="SELECT k.id,k.title,k.artist,k.code,k.genre,k.year,k.format,k.size,"+
  "k.cover_url,k.collection_id,k.master_asset_id,k.preview_asset_id,k.published_at,k.created_at,"+
  "a.file_name AS asset_file_name,a.size AS asset_size,a.storage_key";
async function getCollections(env:PublicEnv):Promise<Response>{
  const rows=await env.DB.prepare(baseCollectionSql+" ORDER BY c.year DESC,c.month DESC,c.sort_order ASC").all<Collection>();
  return json((rows.results??[]).map(c=>summary(c,c.karaoke_count)));
}
async function getCollection(env:PublicEnv,id:string):Promise<Response>{
  const c=await env.DB.prepare(baseCollectionSql+" WHERE c.id=?").bind(id).first<Collection>();
  if(!c||!c.active)return error(404,"COLLECTION_NOT_FOUND");
  const rows=await env.DB.prepare(karaokeProjection+" FROM karaokes k "+
    "INNER JOIN assets a ON a.id=k.master_asset_id AND a.provider='dropbox' "+
    "WHERE k.collection_id=? AND k.catalog_active=1 ORDER BY k.title ASC").bind(id).all<Karaoke>();
  const entries=(rows.results??[]).map(k=>karaokeDto(k,c.storage_path));
  return json({collection:summary(c,entries.length),karaokes:entries});
}
async function search(env:PublicEnv,url:URL):Promise<Response>{
  const q=url.searchParams.get("q")?.trim()||"";
  const genre=url.searchParams.get("genre")||"";
  const yearParam=url.searchParams.get("year");
  const year=yearParam===null?null:Number(yearParam);
  const collectionId=url.searchParams.get("collectionId")||"";
  const sort=url.searchParams.get("sort")||"title";
  if(q.length>200||genre.length>100||collectionId.length>150||
    (year!==null&&(!Number.isInteger(year)||year<1900||year>=2100))||
    !["title","artist","recent"].includes(sort))return error(400,"INVALID_INPUT");
  const where=["c.active=1","k.catalog_active=1","a.provider='dropbox'"];
  const binds:(string|number)[]=[];
  if(q){where.push("(k.title LIKE ? OR k.artist LIKE ? OR k.code LIKE ?)");binds.push("%"+q+"%","%"+q+"%","%"+q+"%");}
  if(genre){where.push("k.genre=?");binds.push(genre);}
  if(collectionId){where.push("c.id=?");binds.push(collectionId);}
  if(year!==null){where.push("k.year=?");binds.push(year);}
  const order=sort==="artist"?"k.artist ASC":sort==="recent"?"k.created_at DESC":"k.title ASC";
  const sql=karaokeProjection+",c.storage_path AS collection_path FROM karaokes k "+
    "JOIN collections c ON c.id=k.collection_id JOIN assets a ON a.id=k.master_asset_id "+
    "WHERE "+where.join(" AND ")+" ORDER BY "+order+" LIMIT 200";
  const found=await env.DB.prepare(sql).bind(...binds).all<Karaoke>();
  return json((found.results??[]).map(k=>karaokeDto(k,k.collection_path??"")));
}
export async function handlePublicApi(request:Request,url:URL,env:PublicEnv):Promise<Response|undefined>{
  if(request.method!=="GET")return undefined;
  if(url.pathname==="/api/public/collections")return getCollections(env);
  const match=/^\/api\/public\/collections\/([^/]+)$/.exec(url.pathname);
  if(match&&match[1]&&match[1].length<180)return getCollection(env,decodeURIComponent(match[1]));
  if(url.pathname==="/api/public/karaokes/search")return search(env,url);
  return undefined;
}
