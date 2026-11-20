import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const manifest=JSON.parse(fs.readFileSync('apps/peru-lab/demo-pilot-manifest.json','utf8'));
const shop='https://djgabo-tienda-peru-lab-production.up.railway.app';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'peru-demo-r2-test-'));
const chrome=[path.join(process.env.ProgramFiles,'Google','Chrome','Application','chrome.exe'),path.join(process.env['ProgramFiles(x86)'],'Microsoft','Edge','Application','msedge.exe')].find(fs.existsSync);
assert.ok(chrome);
const proc=spawn(chrome,['--headless=new','--remote-debugging-port=0','--no-first-run','--disable-background-networking','--autoplay-policy=no-user-gesture-required','--user-data-dir='+dir,'about:blank'],{stdio:'ignore'});
const nap=ms=>new Promise(r=>setTimeout(r,ms));
let ws;
try{
 const file=path.join(dir,'DevToolsActivePort');
 for(let i=0;i<100&&!fs.existsSync(file);i++)await nap(100);
 const port=fs.readFileSync(file,'utf8').split(/\r?\n/)[0];
 const pages=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
 ws=new WebSocket(pages.find(x=>x.type==='page').webSocketDebuggerUrl);
 await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});
 let i=0;const pending=new Map();
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const f=pending.get(m.id);pending.delete(m.id);if(f)m.error?f.reject(Error(m.error.message)):f.resolve(m.result)}};
 const cmd=(method,params={})=>new Promise((resolve,reject)=>{const id=++i;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}))});
 const evalJs=async expression=>{const r=await cmd('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result.value};
 await cmd('Page.enable');await cmd('Page.navigate',{url:shop});
 for(let i=0;i<100;i++){if(await evalJs('typeof openDemo==="function"&&document.querySelectorAll("#grid .card").length>0'))break;await nap(250)}
 assert.ok(await evalJs('typeof openDemo==="function"'));
 const catalog=await(await fetch(shop+'/api/catalog/peru/index.json')).json();
 for(const format of ['WAV+CDG','MP3+CDG']){
  const id=Object.keys(manifest.items).find(id=>manifest.items[id].format===format),t=catalog.tracks.find(x=>x.id===id);
  await evalJs('openDemo('+JSON.stringify(t)+')');
  let status;
  for(let i=0;i<120;i++){
   status=await evalJs(`(()=>{const f=document.querySelector('#frameBox iframe');if(!f)return null;const a=f.contentDocument?.querySelector('audio');return {url:a?.currentSrc||'',time:a?.currentTime||0,ready:a?.readyState||0,paused:a?.paused,canvas:!!f.contentDocument?.querySelector('canvas'),error:a?.error?.code||null}})()`);
   if(status?.time>1.5&&status.ready>=2)break;
   await nap(250);
  }
  assert.ok(status?.time>1.5&&status.ready>=2&&status.canvas&&!status.error,JSON.stringify(status));
  assert.ok(status.url.startsWith(manifest.origin+'/peru/'),status.url);
  console.log('BROWSER PASS',format,t.artist+' - '+t.title,'playback',status.time.toFixed(2),'source R2','canvas',status.canvas);
  await evalJs("document.querySelector('#demo').close();document.querySelector('#frameBox').replaceChildren()");
 }
}finally{ws?.close();proc.kill();}
