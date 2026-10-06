import { useMemo, useRef, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { CollectionSummaryDTO } from "@djgabo/shared";
import { CheckCircle2, ChevronDown, Loader2, Lock } from "lucide-react";
import { api } from "../lib/apiClient";
import { moreYears, primaryYears } from "../lib/covers";
import { CoverArt } from "../components/CoverArt";
import { VipShell } from "../components/VipShell";
import { useAuth } from "../lib/authContext";

export default function UpdatesPage() {
  const { user } = useAuth();
  const [year, setYear] = useState(2026);
  const [moreOpen, setMoreOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data = [], isLoading, isError } = useQuery({ queryKey: ["collections", user ? "private" : "public"], queryFn: () => api.get<CollectionSummaryDTO[]>(user ? "/collections" : "/public/collections") });
  const periods = useMemo(() => data.filter((c) => c.year === year).sort((a,b) => b.month - a.month), [data, year]);

  useEffect(() => { const fn=(e:MouseEvent)=>{if(ref.current && !ref.current.contains(e.target as Node)) setMoreOpen(false)}; document.addEventListener("mousedown",fn); return()=>document.removeEventListener("mousedown",fn); },[]);

  return <VipShell>
    <div className="space-y-4">
      <div><h1 className="text-xl font-bold">Actualizaciones</h1><p className="mt-0.5 text-[12px] text-muted-foreground">Carpetas mensuales con los últimos karaokes subidos.</p></div>
      <div className="flex items-stretch gap-2 border-b border-white/[0.06]">
        <div className="flex flex-1 items-center gap-1 overflow-x-auto">
          {primaryYears.map((y)=><button key={y} onClick={()=>setYear(y)} className={`relative whitespace-nowrap px-3 py-2 text-[13px] font-medium ${year===y?"text-primary":"text-muted-foreground hover:text-foreground"}`}>{y}{year===y && <span className="absolute bottom-[-1px] left-2 right-2 h-0.5 rounded-full bg-primary" />}</button>)}
        </div>
        <div className="relative" ref={ref}><button onClick={()=>setMoreOpen(v=>!v)} className={`relative inline-flex items-center gap-1 whitespace-nowrap px-3 py-2 text-[13px] font-medium ${moreYears.includes(year)?"text-primary":"text-muted-foreground hover:text-foreground"}`}>MÁS AÑOS <ChevronDown className={`h-3 w-3 ${moreOpen?"rotate-180":""}`} />{moreYears.includes(year)&&<span className="absolute bottom-[-1px] left-2 right-2 h-0.5 rounded-full bg-primary" />}</button>
          {moreOpen && <div className="absolute right-0 top-full z-30 mt-1 w-32 overflow-hidden rounded-md border border-white/[0.08] bg-popover shadow-xl">{moreYears.map((y)=><button key={y} onClick={()=>{setYear(y);setMoreOpen(false)}} className={`w-full px-3 py-2 text-left text-[13px] ${year===y?"bg-white/[0.04] text-primary":"hover:bg-white/[0.04]"}`}>{y}</button>)}</div>}
        </div>
      </div>

      {isLoading ? <div className="flex justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div> : isError || periods.length===0 ? <div className="rounded-[10px] border border-white/[0.06] bg-card py-16 text-center text-[13px] text-muted-foreground">{isError?"No se pudo cargar el catálogo.":"Aún no hay actualizaciones."}</div> :
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{periods.map((c)=>{
          return <Link key={c.id} to={`/panel/actualizaciones/${c.id}`} className={`group overflow-hidden rounded-[10px] border border-white/[0.06] bg-card transition hover:border-white/[0.12] ${c.locked?"opacity-75":""}`}>
            <div className="relative aspect-square bg-secondary"><CoverArt year={c.year} month={c.month} fallbackUrl={c.coverUrl} alt={c.title} className={`h-full w-full ${c.locked?"grayscale":""}`} />
              <div className={`absolute right-2 top-2 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-mono text-[10px] font-semibold ${c.locked?"bg-black/80 text-white":"bg-emerald-500/90 text-black"}`}>{c.locked?<><Lock className="h-2.5 w-2.5"/>LOCK</>:<><CheckCircle2 className="h-2.5 w-2.5"/>OK</>}</div>
            </div>
            <div className="p-3"><div className="truncate text-[13px] font-semibold group-hover:text-primary">{c.title}</div><div className="mt-0.5 font-mono text-[10px] text-muted-foreground">{String(c.month).padStart(2,"0")}/{c.year} • {c.karaokeCount} temas</div></div>
          </Link>})}</div>}
    </div>
  </VipShell>;
}
