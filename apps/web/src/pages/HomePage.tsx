import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { CollectionSummaryDTO } from "@djgabo/shared";
import { CheckCircle2, Crown, FolderOpen, Loader2 } from "lucide-react";
import { api } from "../lib/apiClient";
import { coverFor } from "../lib/covers";
import { VipShell } from "../components/VipShell";
import { BatchDownloadModal } from "../components/BatchDownloadModal";

function sortCollections(a: CollectionSummaryDTO, b: CollectionSummaryDTO) {
  return b.year - a.year || b.month - a.month || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}
function shortDate(iso: string) { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }); }

export default function HomePage() {
  const [download, setDownload] = useState<CollectionSummaryDTO | null>(null);
  const { data = [], isLoading, isError } = useQuery({ queryKey: ["collections"], queryFn: () => api.get<CollectionSummaryDTO[]>("/collections") });
  const collections = useMemo(() => [...data].sort(sortCollections), [data]);
  const latest = collections.find((c) => !c.locked) ?? collections[0];
  const recent = collections.filter((c) => c.id !== latest?.id).slice(0, 4);

  return (
    <VipShell>
      <div className="space-y-6">
        {isLoading && <div className="flex justify-center py-24"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
        {isError && <div className="rounded-[10px] border border-white/[0.06] bg-card p-12 text-center text-[13px] text-muted-foreground">No se pudo cargar el catâlogo.</div>}
        {latest && (
          <>
            <section className="overflow-hidden rounded-[10px] border border-white/[0.06] bg-card">
              <div className="flex flex-col gap-5 p-4 sm:flex-row sm:p-5">
                <div className="relative mx-auto aspect-square w-full max-w-[280px] shrink-0 overflow-hidden rounded-md bg-secondary sm:mx-0 sm:h-[280px] sm:w-[280px]">
                 {(coverFor(latest.year,latest.month) || latest.coverUrl) ? <img src={coverFor(latest.year,latest.month) || latest.coverUrl || ""} alt={latest.title} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center font-mono text-sm font-bold text-primary">DJGABO</div>}
                  <div className="absolute left-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-full bg-black/70 px-2 py-0.5 font-mono text-[10px] font-semibold text-primary backdrop-blur"><Crown className="h-3 w-3" /> TOP HITS</div>
                </div>
                <div className="flex min-w-0 flex-1 flex-col justify-center">
                  <div className="mb-2 inline-flex items-center gap-1.5 text-[12px] font-semibold text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> Actualización completada</div>
                  <h1 className="mb-1.5 text-2xl font-bold leading-tight sm:text-3xl">{latest.title}</h1>
                  <p className="mb-0.5 text-[13px] text-muted-foreground">Edición DJGABO</p>
                  <p className="mb-4 font-mono text-[11px] text-muted-foreground">{latest.karaokeCount} karaokes • Última subida: {shortDate(latest.updatedAt)}</p>
                  <div className="flex flex-wrap gap-2.5">
                    <Link to={`/panel/actualizaciones/${latest.id}`} className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-[13px] font-semibold text-black hover:brightness-95"><FolderOpen className="h-4 w-4" /> Ver paquete</Link>
                    {!latest.locked && <button onClick={() => setDownload(latest)} className="rounded-full border border-white/[0.12] px-4 py-2 text-[13px] font-medium hover:bg-white/[0.04]">Descargar todo</button>}
                  </div>
                </div>
              </div>
            </section>

            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-lg font-bold">Última entrega <span className="rounded bg-primary px-1.5 py-0.5 font-mono text-[10px] font-bold text-black">NUEVO</span></h2>
                <Link to="/panel/actualizaciones" className="text-[13px] text-primary hover:underline">Ver todos →</Link>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {recent.map((c) => <Link key={c.id} to={`/panel/actualizaciones/${c.id}`} className="group overflow-hidden rounded-[10px] border border-white/[0.06] bg-card hover:border-white/[0.12]">
                  <div className="aspect-square bg-secondary">{(coverFor(c.year,c.month) || c.coverUrl) ? <img src={coverFor(c.year,c.month) || c.coverUrl || ""} alt={c.title} loading="lazy" className={`h-full w-full object-cover ${c.locked ? "grayscale opacity-60" : ""}`} /> : <div className="flex h-full items-center justify-center font-mono text-xs font-bold text-muted-foreground">DJGABO</div>}</div>
                  <div className="p-3"><div className="truncate text-[13px] font-semibold group-hover:text-primary">{c.title}</div><div className="mt-0.5 font-mono text-[10px] text-muted-foreground">{c.karaokeCount} temas{c.locked ? " • BLOQUEADO" : ""}</div></div>
                </Link>)}
              </div>
            </section>
          </>
        )}
      </div>
      {download && <BatchDownloadModal collectionId={download.id} title={download.title} onClose={() => setDownload(null)} />}
    </VipShell>
  );
}
