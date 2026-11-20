/* DJGABO · Browser-only CDG to MP4. Engine reused from the existing CDG editor (2026-11-11); no OVH rendering. */
const WIDTH=288,HEIGHT=192,RAW_WIDTH=300,RAW_HEIGHT=216,FPS=25,PPS=300,MAX_SECONDS=20*60;
 const HQX_WASM_URL='/mp4/squooshhqx_bg.wasm';
 const HQX_RESTART_EVERY=20;
 const QUALITY={
  hd:{width:1280,height:720,bitrate:3500000,label:'HD 720p'},
  fhd:{width:1920,height:1080,bitrate:7000000,label:'Full HD 1080p'}
 };

const state={wasm:null,abort:null,diag:null,polyfillRegistered:false}; const log=()=>{};
async function loadHqxWasm(){
 if(state.wasm)return state.wasm;
 const r=await fetch(HQX_WASM_URL,{cache:'force-cache',credentials:'same-origin',signal:state.abort?.signal});
 if(!r.ok)throw Error('HQX WASM: HTTP '+r.status);
 const wasm=await r.arrayBuffer();
 if(wasm.byteLength<10000)throw Error('HQX WASM incompleto.');
 state.wasm=wasm;log('hqx-wasm-listo',{bytes:wasm.byteLength});return wasm;
}

async function detect(quality){
 if(typeof VideoEncoder!=='function'||typeof AudioEncoder!=='function')
   throw Error('Este navegador no tiene WebCodecs (H.264/AAC). Utiliza Brave o Chrome actualizado.');
 let video=false;
 for(const codec of (quality===QUALITY.hd?['avc1.64001F','avc1.42E01F']:['avc1.640028','avc1.42E028','avc1.640029'])){
   try{
     const check=await VideoEncoder.isConfigSupported({codec,width:quality.width,height:quality.height,framerate:FPS,bitrate:quality.bitrate,hardwareAcceleration:'prefer-hardware',latencyMode:'quality'});
     if(check.supported){video=true;break;}
   }catch(_){}
 }
 if(!video)throw Error('Tu navegador no permite codificar H.264 en '+quality.label+' ('+quality.width+'×'+quality.height+'). No se enviará a OVH.');
 let audio=null;
 for(const rate of [44100,48000]){
   for(const bitrate of [320000,256000,192000]){
     try{
       const check=await AudioEncoder.isConfigSupported({codec:'mp4a.40.2',sampleRate:rate,numberOfChannels:2,bitrate});
       if(check.supported){audio={rate,bitrate};break;}
     }catch(_){}
   }
   if(audio)break;
 }
 if(!audio)audio={rate:44100,bitrate:320000,polyfill:true};
 return audio;
}
async function decodeWav(buffer,rate){
 const context=new (window.AudioContext||window.webkitAudioContext)({sampleRate:rate});
 try{
   const audio=await context.decodeAudioData(buffer);
   if(audio.numberOfChannels<1||audio.numberOfChannels>2)throw Error('Audio con canales no admitidos.');
   if(!Number.isFinite(audio.duration)||audio.duration<=0||audio.duration>MAX_SECONDS)
     throw Error('La canción debe durar entre 1 segundo y 20 minutos para usar WebCodecs.');
   return audio;
 }finally{await context.close();}
}

  class CDGDecoder {
    constructor(){ this.reset(); }
    reset(){
      this.frame=new Uint8Array(RAW_WIDTH*RAW_HEIGHT);
      this.palette=Array.from({length:16},()=>[0,0,0,255]);
      this.border=0; this.transparent=0; this.memoryColor=0; this.hOffset=0; this.vOffset=0;
    }
    clear(color){ this.memoryColor=color&15; this.frame.fill(this.memoryColor); }
    scroll(color,hcmd,vcmd,copyMode){
      const hdir=(hcmd>>4)&3,vdir=(vcmd>>4)&3;
      this.hOffset=hcmd&7; this.vOffset=vcmd&15;
      const dx=hdir===1?6:(hdir===2?-6:0),dy=vdir===1?12:(vdir===2?-12:0);
      if(!dx&&!dy)return;
      const old=this.frame.slice(),fill=color&15;
      for(let y=0;y<RAW_HEIGHT;y++)for(let x=0;x<RAW_WIDTH;x++){
        const sx=x-dx,sy=y-dy,dst=y*RAW_WIDTH+x;
        if(sx>=0&&sx<RAW_WIDTH&&sy>=0&&sy<RAW_HEIGHT)this.frame[dst]=old[sy*RAW_WIDTH+sx];
        else if(copyMode){
          const wx=((sx%RAW_WIDTH)+RAW_WIDTH)%RAW_WIDTH,wy=((sy%RAW_HEIGHT)+RAW_HEIGHT)%RAW_HEIGHT;
          this.frame[dst]=old[wy*RAW_WIDTH+wx];
        }else this.frame[dst]=fill;
      }
    }
    packet(p){
      if(!p||p.length!==24||((p[0]&63)!==9))return;
      const ins=p[1]&63,d=new Uint8Array(16);
      for(let i=0;i<16;i++)d[i]=p[4+i]&63;
      if(ins===1)this.clear(d[0]);
      else if(ins===2)this.border=d[0]&15;
      else if(ins===6||ins===38){
        const c0=d[0]&15,c1=d[1]&15,row=d[2]&31,col=d[3]&63,y0=row*12,x0=col*6;
        for(let r=0;r<12;r++){
          const bits=d[4+r],y=y0+r;if(y>=RAW_HEIGHT)continue;
          for(let c=0;c<6;c++){
            const x=x0+c;if(x>=RAW_WIDTH)continue;
            const value=(bits&(1<<(5-c)))?c1:c0,idx=y*RAW_WIDTH+x;
            this.frame[idx]=ins===38?(this.frame[idx]^value):value;
          }
        }
      }else if(ins===20)this.scroll(d[0],d[1],d[2],false);
      else if(ins===24)this.scroll(d[0],d[1],d[2],true);
      else if(ins===30||ins===31){
        const base=ins===30?0:8;
        for(let i=0;i<8;i++){
          const a=d[i*2],b=d[i*2+1];
          const r=(a&60)>>2,g=((a&3)<<2)|((b&48)>>4),bl=b&15;
          this.palette[base+i]=[r*17,g*17,bl*17,255];
        }
      }else if(ins===28)this.transparent=d[0]&15;
    }
  }

// HQX Wasm is isolated in a classic Blob worker; restart every 20 renders.
// This is the exact memory mitigation validated by a full 2:53 song conversion.
const HQX_WORKER_SOURCE="\n'use strict';\nlet wasm=null,used=0;\nfunction fail(id,e){self.postMessage({id,ok:false,error:{name:e?.name||'Error',message:e?.message||String(e),stack:e?.stack||''}});}\nfunction run(bytes,width,height,factor){\n if(!wasm)throw Error('HQX no inicializado');\n if(width!==288||height!==192||factor!==3)throw Error('Dimensiones HQX no admitidas');\n if(bytes.byteLength!==width*height*4)throw Error('Datos HQX incompletos');\n const arr=new Uint32Array(bytes),ret=wasm.__wbindgen_add_to_stack_pointer(-16);\n try{\n  const ptr=wasm.__wbindgen_malloc(arr.length*4);\n  new Uint32Array(wasm.memory.buffer).set(arr,ptr/4);\n  wasm.resize(ret,ptr,arr.length,width,height,factor);\n  const header=new Int32Array(wasm.memory.buffer),outputPtr=header[ret/4],outputLen=header[ret/4+1];\n  if(outputLen!==width*height*factor*factor)throw Error('HQX tamaño de salida inválido: '+outputLen);\n  const result=new Uint8ClampedArray(wasm.memory.buffer,outputPtr,outputLen*4).slice();\n  wasm.__wbindgen_free(outputPtr,outputLen*4);\n  used++;return result;\n }finally{wasm.__wbindgen_add_to_stack_pointer(16);}\n}\nself.onmessage=async function(e){\n const {id,type}=e.data;\n try{\n  if(type==='init'){\n   const result=await WebAssembly.instantiate(e.data.bytes,{});\n   wasm=result.instance.exports;used=0;\n   self.postMessage({id,ok:true,result:{memoryBytes:wasm.memory.buffer.byteLength}});\n  }else if(type==='render'){\n   const out=run(e.data.buffer,288,192,3);\n   self.postMessage({id,ok:true,result:{buffer:out.buffer,ops:used,memoryBytes:wasm.memory.buffer.byteLength}},[out.buffer]);\n  }else throw Error('Comando HQX desconocido.');\n }catch(err){fail(id,err);}\n};\n";
class SafeHqx {
 constructor(bytes){this.bytes=bytes;this.worker=null;this.workerURL=null;this.pending=new Map();
  this.sequence=0;this.used=0;this.instances=0;this.restarts=0;this.disposed=false;}
 async open(restarted=false){
  if(this.disposed)throw Error('HQX cancelado');
  this.closeWorker();
  this.workerURL=URL.createObjectURL(new Blob([HQX_WORKER_SOURCE],{type:'text/javascript'}));
  const w=new Worker(this.workerURL);this.worker=w;
  w.onmessage=e=>{const v=e.data,p=this.pending.get(v.id);if(!p)return;clearTimeout(p.timer);this.pending.delete(v.id);
   if(v.ok)p.resolve(v.result);else p.reject(Object.assign(new Error(v.error?.message||'Error HQX'),{name:v.error?.name||'Error',stack:v.error?.stack||''}));};
  w.onerror=e=>{for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('Error HQX Worker: '+e.message));}this.pending.clear();};
  this.used=0;this.instances++;
  const b=this.bytes.slice(0);await this.request('init',{bytes:b},[b],30000);
  if(restarted){this.restarts++;state.diag.metrics.workerRestarts=this.restarts;log('hqx-worker-reiniciado',{instance:this.instances});}
  else log('hqx-worker-iniciado',{instance:this.instances});
 }
 request(type,data,transfer=[],wait=40000){
  if(!this.worker)throw Error('HQX worker inactivo');
  const id=++this.sequence;return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('Timeout HQX '+type));},wait);
   this.pending.set(id,{resolve,reject,timer});
   try{this.worker.postMessage({id,type,...data},transfer);}catch(err){clearTimeout(timer);this.pending.delete(id);reject(err);}
  });
 }
 async upscale(rgba){
  if(this.disposed)throw Error('HQX cancelado');
  if(!this.worker)await this.open();
  if(this.used>=HQX_RESTART_EVERY)await this.open(true);
  const input=rgba.slice().buffer;
  const out=await this.request('render',{buffer:input},[input]);
  this.used++;state.diag.metrics.renders++;state.diag.metrics.workerMemoryBytes=out.memoryBytes;
  if(out.buffer.byteLength!==WIDTH*HEIGHT*36)throw Error('HQX devolvió salida incompleta.');
  return new Uint8ClampedArray(out.buffer);
 }
 closeWorker(){
  if(this.worker){this.worker.terminate();this.worker=null;}
  if(this.workerURL){URL.revokeObjectURL(this.workerURL);this.workerURL=null;}
  for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('HQX worker cerrado'));}
  this.pending.clear();
 }
 dispose(){this.disposed=true;this.closeWorker();}
}

class FramePainter{
 constructor(cdg,background,hqx,quality){
   const create=window.DJGABO_CDG_FINAL_PREVIEW?.newDecoder;
   this.decoder=(typeof create==='function'?create():new CDGDecoder());
   this.cdg=cdg;this.processed=0;this.background=background;this.hqx=hqx;this.quality=quality;
   this.mask=new Uint8Array(WIDTH*HEIGHT);
   this.rowMask=new Uint8Array(WIDTH*HEIGHT);
   this.bitmap=new ImageData(WIDTH,HEIGHT);
   this.previous=null;this.reused=0;this.rebuilt=0;
   this.scaled=document.createElement('canvas');
   this.scaled.width=WIDTH*3;this.scaled.height=HEIGHT*3;
   this.scaledCtx=this.scaled.getContext('2d');
   this.canvas=document.createElement('canvas');
   this.canvas.width=quality.width;this.canvas.height=quality.height;
   this.ctx=this.canvas.getContext('2d',{alpha:false});
 }
 async draw(t){
   const target=Math.min(Math.floor(this.cdg.length/24),Math.floor(Math.max(0,t)*PPS));
   let dirty=this.processed===0;
   while(this.processed<target){
     const p=this.cdg.subarray(this.processed*24,this.processed*24+24);
     this.processed++;
     if((p[0]&63)===9&&[1,2,6,38,20,24,30,31,28].includes(p[1]&63))dirty=true;
     this.decoder.packet(p);
   }
   if(!dirty)return;
   const d=this.decoder,mask=this.mask,row=this.rowMask,rgba=this.bitmap.data;
   const ox=Math.min(5,d.hOffset),oy=Math.min(11,d.vOffset);
   for(let y=0;y<HEIGHT;y++){
     const source=(y+12+oy)*RAW_WIDTH+6+ox;
     for(let x=0;x<WIDTH;x++){
       const index=d.frame[source+x]&15,k=y*WIDTH+x;
       mask[k]=(index!==d.memoryColor&&index!==d.transparent)?1:0;
       const o=k*4;
       if(mask[k]){
         // Codex palette policy: 4-bit colour component expanded by 16, not 17.
         const color=d.palette[index];
         rgba[o]=(color[0]>>>4)*16;
         rgba[o+1]=(color[1]>>>4)*16;
         rgba[o+2]=(color[2]>>>4)*16;
         rgba[o+3]=255;
       }else{
         rgba[o]=0;rgba[o+1]=0;rgba[o+2]=0;rgba[o+3]=0;
       }
     }
   }
   // Exact 3x3 maximum-filter outline policy of Codex.
   for(let y=0;y<HEIGHT;y++)for(let x=0;x<WIDTH;x++){
     const k=y*WIDTH+x;
     row[k]=mask[k]||(x>0&&mask[k-1])||(x+1<WIDTH&&mask[k+1])?1:0;
   }
   for(let y=0;y<HEIGHT;y++)for(let x=0;x<WIDTH;x++){
     const k=y*WIDTH+x;if(mask[k])continue;
     const border=row[k]||(y>0&&row[k-WIDTH])||(y+1<HEIGHT&&row[k+WIDTH]);
     if(border)rgba[k*4+3]=255;
   }
   // Codex reuses rendered frames when the CDG output has not changed.
   // Check after palette/outline computation, not merely by CDG packet count.
   if(this.previous&&this.previous.length===rgba.length){
     let unchanged=true;
     for(let i=0;i<rgba.length;i++){if(rgba[i]!==this.previous[i]){unchanged=false;break;}}
     if(unchanged){this.reused++;return;}
   }
   this.previous=new Uint8ClampedArray(rgba);
   this.rebuilt++;
   // Actual HQX3 performed locally by WebAssembly, not Canvas bilinear.
   const result=await this.hqx.upscale(rgba);
   if(result.length!==864*576*4)
     throw Error('El filtro HQX no devolvió los fotogramas esperados.');
   this.scaledCtx.putImageData(new ImageData(
     result,864,576),0,0);
   const ctx=this.ctx,quality=this.quality,scale=quality.width/1280;
   if(this.background){
     ctx.fillStyle='#000';ctx.fillRect(0,0,quality.width,quality.height);
     // Codex uses contain (letterboxing), not stretched background.
     const b=this.background,ratio=Math.min(quality.width/b.width,quality.height/b.height);
     const w=b.width*ratio,h=b.height*ratio;
     ctx.drawImage(b,(quality.width-w)/2,(quality.height-h)/2,w,h);
   }else{
     ctx.fillStyle='#000';ctx.fillRect(0,0,quality.width,quality.height);
   }
   // Shadow approximates the Codex Gaussian offset; the HQX3 layer is now exact.
   ctx.imageSmoothingEnabled=true;
   ctx.shadowColor='rgba(0,0,0,.52)';
   ctx.shadowBlur=3*scale;ctx.shadowOffsetX=6*scale;ctx.shadowOffsetY=6*scale;
   ctx.drawImage(this.scaled,208*scale,72*scale,864*scale,576*scale);
   ctx.shadowColor='transparent';ctx.shadowBlur=0;ctx.shadowOffsetX=0;ctx.shadowOffsetY=0;
 }
}

// Adapter for the existing DJGABO CDG renderer; engine functions are vendored above.
const quality=QUALITY.hd;
let current=null,manualUrl=null,manualName='';
const element=id=>document.getElementById(id);
const status=(text,error=false)=>{const p=element('videoStatus');p.hidden=false;p.textContent=text;p.classList.toggle('error',error)};
const progress=(percent,description)=>{const p=element('videoProgress');p.hidden=false;p.value=Math.max(0,Math.min(100,percent));status(`${description} · ${Math.round(percent)}%`)};
function release(){if(manualUrl)URL.revokeObjectURL(manualUrl);manualUrl=null;manualName='';element('videoRetry').hidden=true;}
function download(){if(!manualUrl)return;const a=document.createElement('a');a.href=manualUrl;a.download=manualName;document.body.appendChild(a);a.click();a.remove();}
function buttons(){document.querySelectorAll('[data-video-download]').forEach(b=>{b.disabled=!!current});element('videoCancel').hidden=!current;}
function cancelled(){if(state.abort?.signal.aborted)throw new DOMException('Cancelado','AbortError');}
async function source(path,ticket,label,first,last){
 const response=await fetch(path,{headers:{'X-Conversion-Ticket':ticket},credentials:'same-origin',cache:'no-store',signal:state.abort.signal});
 if(!response.ok)throw Error('No se pudo cargar el karaoke. Vuelve a intentar.');
 const size=Number(response.headers.get('Content-Length')||0),reader=response.body?.getReader();
 if(!reader)return response.arrayBuffer();
 let total=0;const parts=[];
 while(true){cancelled();const {done,value}=await reader.read();if(done)break;parts.push(value);total+=value.byteLength;if(total>250*1024*1024){await reader.cancel();throw Error('Archivo demasiado grande para generar el video en este dispositivo.');}if(size)progress(first+(last-first)*Math.min(1,total/size),label);}
 const result=new Uint8Array(total);let at=0;for(const part of parts){result.set(part,at);at+=part.byteLength}return result.buffer;
}
async function start(track,csrf){
 if(current)return;current=track.id;state.abort=new AbortController();state.diag={metrics:{renders:0,workerRestarts:0,workerMemoryBytes:0}};release();buttons();
 let output=null,hqx=null,video=null,audioSource=null,soundJob=null;
 try{
  progress(0,'Comprobando navegador');const config=await detect(quality);cancelled();
  const mod=await import('/mp4/cdg-webcodecs-deps.mjs');
  if(config.polyfill&&!state.polyfillRegistered){mod.registerAacEncoder();state.polyfillRegistered=true;}
  const {Output,Mp4OutputFormat,BufferTarget,CanvasSource,AudioBufferSource,Quality}=mod;
  hqx=new SafeHqx(await loadHqxWasm());cancelled();
  const path='/api/my-karaokes/'+encodeURIComponent(track.id)+'/video';
  const auth=await fetch(path,{method:'POST',headers:{'X-CSRF-Token':csrf},credentials:'same-origin',cache:'no-store',signal:state.abort.signal});
  if(!auth.ok)throw Error('Este karaoke todavía no está disponible en tu cuenta.');const {ticket}=await auth.json();
  progress(3,'Preparando karaoke');const cdg=new Uint8Array(await source(path+'/cdg',ticket,'Preparando karaoke',3,10));
  if(cdg.length<24||cdg.length%24!==0)throw Error('El karaoke no tiene un CDG válido.');
  progress(10,'Cargando audio');const bytes=await source(path+'/audio',ticket,'Cargando audio',10,21);cancelled();
  progress(22,'Preparando audio');const audio=await decodeWav(bytes,config.rate);cancelled();
  const painter=new FramePainter(cdg,null,hqx,quality),target=new BufferTarget();
  output=new Output({format:new Mp4OutputFormat(),target});
  video=new CanvasSource(painter.canvas,{codec:'avc',quality:new Quality({bitrate:quality.bitrate}),hardwareAcceleration:'prefer-hardware',latencyMode:'quality'});
  output.addVideoTrack(video,{frameRate:FPS});audioSource=new AudioBufferSource({codec:'aac',quality:new Quality({bitrate:config.bitrate})});output.addAudioTrack(audioSource);
  progress(25,'Iniciando video');await output.start();
  soundJob=(async()=>{await audioSource.add(audio);await audioSource.close()})();soundJob.catch(()=>{});
  const frames=Math.ceil(audio.duration*FPS-1e-8);
  for(let k=0;k<frames;k++){cancelled();const time=k/FPS;await painter.draw(time);await video.add(time,Math.min(1/FPS,Math.max(.00001,audio.duration-time)),{keyFrame:k%125===0});if(k%10===0||k===frames-1){progress(26+69*(k+1)/frames,'Generando video en tu dispositivo');await new Promise(r=>setTimeout(r,0));}}
  await video.close();video=null;await soundJob;audioSource=null;cancelled();progress(96,'Finalizando MP4');await output.finalize();cancelled();
  if(!target.buffer||target.buffer.byteLength<10000)throw Error('No se pudo generar un MP4 válido.');
  manualName=(track.artist+' - '+track.title).replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').trim().slice(0,150)+' - HD 720p.mp4';
  manualUrl=URL.createObjectURL(new Blob([target.buffer],{type:'video/mp4'}));element('videoRetry').hidden=false;progress(100,'Video listo');download();status('MP4 HD listo. Si no se descargó, pulsa Descargar nuevamente.');
 }catch(e){element('videoProgress').hidden=true;status(state.abort.signal.aborted?'Conversión cancelada. Puedes volver a intentar.':(e.message||'No se pudo generar el video. Utiliza Chrome o Brave actualizado.'),!state.abort.signal.aborted);if(output&&output.state!=='finalized')try{await output.cancel()}catch(_){}if(soundJob)await soundJob.catch(()=>{});}
 finally{hqx?.dispose();state.abort=null;current=null;buttons();}
}
window.PeruVideo={start,get busy(){return !!current}};
element('videoCancel').onclick=()=>{state.abort?.abort();status('Cancelando…')};element('videoRetry').onclick=download;
window.addEventListener('beforeunload',e=>{if(current){e.preventDefault();e.returnValue=''}});window.addEventListener('pagehide',()=>{state.abort?.abort();release()});
