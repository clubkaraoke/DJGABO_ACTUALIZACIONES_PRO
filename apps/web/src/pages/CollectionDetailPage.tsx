import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { CollectionDetailDTO, KaraokeSummaryDTO } from "@djgabo/shared";
import { ChevronDown, ChevronRight, Folder, Loader2, Share2 } from "lucide-react";
import { api, ApiError } from "../lib/apiClient";
import { coverFor } from "../lib/covers";
import { VipShell } from "../components/VipShell";
import { KaraokeRow } from "../components/KaraokeRow";
import { BatchDownloadModal } from "../components/BatchDownloadModal";
import { EmptyState } from "../components/primitives";

function groupLabel(group: string, index: number) {
  if (group === "__GENERAL__") return `Top Hits ${String(index + 1).padStart(2, "0")}`;
  return `Top Hits ${String(index + 1).padStart(2, "0")}`;
}

export default function CollectionDetailPage(){
  const {id}=useParams<{id:string}>();
  const [query,setQuery]=useState("");
  const [open,setOpen]=useState<string|null>(null);
  const [showBatch,setShowBatch]=useState(false);
  const {data,isLoading,error}=useQuery({queryKey:["collection",id],queryFn:()=>api.get<CollectionDetailDTO>(`/collections/${id}`),enabled:Boolean(id),retry:false});

  const groups=useMemo(()=>{
    if(!data) return [] as [string,KaraokeSummaryDTO[]][];
    const q=query.trim().toLowerCase();
    const map=new Map<string,KaraokeSummaryDTO[]>();
    for(const k of data.karaokes){
      if(q && ![k.title,k.artist,k.code].some(v=>v.toLowerCase().includes(q))) continue;
      const key=k.sourceGroup||"__GENERAL__"; const arr=map.get(key)||[]; arr.push(k); map.set(key,arr);
    }
    return [...map.entries()].sort(([a],[b])=>a.localeCompare(b,"es",{numeric:true,sensitivity:"base"}));
  },[data,query]);

  if(error instanceof ApiError) return <VipShell><div className="mx-auto max-w-4xl"><EmptyState title={error.statusCode===403?"No tienes acceso a esta actualización":"Actualización no encontrada"} description={error.message}/></div></VipShell>;

  return <VipShell searchValue={query} onSearchChange={setQuery} searchPlaceholder="Buscar karaoke, artista o código...">
    <div className="space-y-5">
      <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground"><Link to="/panel/actualizaciones" className="hover:text-foreground">Actualizaciones</Link><ChevronRight className="h-3.5 w-3.5"/><span className="truncate text-foreground">{data?.collection.title||"Cargando..."}</span></div>
      {isLoading && <div className="flex justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground"/></div>}
      {data && <>
        <div className="flex flex-col gap-4 rounded-[10px] border border-white/[0.06] bg-card p-4 sm:flex-row">
          <div className="h-28 w-28 shrink-0 overflow-hidden rounded-md bg-secondary">{(coverFor(data.collection.year,data.collection.month)||data.collection.coverUrl)?<img src={coverFor(data.collection.year,data.collection.month)||data.collection.coverUrl||""} alt={data.collection.title} className="h-full w-full object-cover"/>:<div className="flex h-full items-center justify-center font-mono text-[13px] font-bold text-primary">DJGABO</div>}</div>
          <div className="min-w-0 flex-1"><h1 className="mb-2.5 truncate text-xl font-bold">{data.collection.title}</h1><dl className="space-y-1 text-[12px]"><div className="flex gap-2"><dt className="text-muted-foreground">Karaokes:</dt><dd className="font-mono">{data.collection.karaokeCount}</dd></div><div className="flex gap-2"><dt className="text-muted-foreground">Estado:</dt><dd className="text-emerald-400">Actualización completada</dd></div></dl><div className="mt-3.5 flex flex-wrap gap-2.5"><button onClick={()=>navigator.clipboard?.writeText(window.location.href)} className="inline-flex items-center gap-2 rounded-md border border-white/[0.12] px-3.5 py-2 text-[13px] font-medium hover:bg-white/[0.04]"><Share2 className="h-3.5 w-3.5"/>Compartir</button>{!data.collection.locked&&<button onClick={()=>setShowBatch(true)} className="rounded-md bg-primary px-3.5 py-2 text-[13px] font-semibold text-black hover:brightness-95">Descargar todo</button>}</div></div>
        </div>

        <div className="overflow-hidden rounded-[10px] border border-white/[0.06] bg-card">
          {groups.length===0?<div className="px-4 py-10 text-center text-[13px] text-muted-foreground">No hay resultados.</div>:groups.map(([name,karaokes],index)=>{const expanded=open===name || (open===null&&index===0); return <div key={name} className="border-b border-white/[0.06] last:border-0"><button onClick={()=>setOpen(expanded?"__CLOSED__":name)} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 hover:bg-white/[0.04]">{expanded?<ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground"/>:<ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground"/>}<Folder className="h-4 w-4 shrink-0 text-primary"/><span className="flex-1 truncate text-left text-[13px] font-semibold">{groupLabel(name,index)}</span><span className="font-mono text-[11px] text-muted-foreground">{karaokes.length}</span></button>{expanded&&<div className="border-t border-white/[0.06]"><div className="overflow-x-auto"><table className="w-full min-w-[760px]"><thead><tr className="border-b border-white/[0.06] text-left font-mono text-[10px] uppercase tracking-wide text-muted-foreground"><th className="px-4 py-2.5">Título</th><th className="px-4 py-2.5">Artista</th><th className="px-4 py-2.5">Código</th><th className="px-4 py-2.5">Fecha</th><th className="px-4 py-2.5">Tamaño</th><th className="px-4 py-2.5">Acciones</th></tr></thead><tbody>{karaokes.map(k=><KaraokeRow key={k.id} karaoke={k}/>)}</tbody></table></div></div>}</div>})}
        </div>
        {showBatch&&<BatchDownloadModal collectionId={data.collection.id} title={data.collection.title} onClose={()=>setShowBatch(false)}/>} 
      </>}
    </div>
  </VipShell>
}
