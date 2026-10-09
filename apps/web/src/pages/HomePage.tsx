import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { CollectionSummaryDTO, KaraokeSummaryDTO } from "@djgabo/shared";
import { BellRing, CheckCircle2, Crown, FolderOpen, Loader2, MessageCircle } from "lucide-react";
import { api } from "../lib/apiClient";
import { CoverArt } from "../components/CoverArt";
import { VipShell } from "../components/VipShell";
import { BatchDownloadModal } from "../components/BatchDownloadModal";
import { VipAccessModal } from "../components/VipAccessModal";
import { useAuth } from "../lib/authContext";
import { publicKaraokeDisplay } from "../lib/publicCatalogPresentation";

function sortCollections(a: CollectionSummaryDTO, b: CollectionSummaryDTO) {
  return b.year - a.year || b.month - a.month || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}
function shortDate(iso: string) { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }); }

interface KaraokeRequestNotice {
  id: string;
  sourceTitle: string | null;
  sourceAuthor: string | null;
  status: "REQUESTED" | "IN_PROGRESS" | "READY" | "REJECTED";
  matchedKaraokeId: string | null;
  matchedCollectionId: string | null;
  matchedCollectionTitle: string | null;
  readyAt: string | null;
}

export default function HomePage() {
  const { user } = useAuth();
  const hasVipAccess = Boolean(user && (user.role === "ADMIN" || user.plan));
  const activationPending = user?.role === "MEMBER" && !user.plan;
  const activationWhatsappUrl = user
    ? `https://wa.me/51921675846?text=${encodeURIComponent(`Hola DJGABO, ya me registré en la nueva web con el correo ${user.email} y solicito la activación de mi membresía VIP.`)}`
    : "";
  const [download, setDownload] = useState<CollectionSummaryDTO | null>(null);
  const [showVip, setShowVip] = useState(false);
  const { data = [], isLoading, isError } = useQuery({
    queryKey: ["collections", hasVipAccess ? "private" : "public"],
    queryFn: () => api.get<CollectionSummaryDTO[]>(hasVipAccess ? "/collections" : "/public/collections"),
  });
  const { data: newestKaraokes = [] } = useQuery({
    queryKey: ["home-newest-karaokes"],
    queryFn: () => api.get<KaraokeSummaryDTO[]>("/public/karaokes/search?sort=recent"),
    staleTime: 30_000,
  });
  const { data: karaokeRequests = [] } = useQuery({
    queryKey: ["karaoke-requests", user?.id ?? "guest"],
    queryFn: () => api.get<KaraokeRequestNotice[]>("/karaoke-requests"),
    enabled: Boolean(user),
  });
  const collections = useMemo(() => [...data].sort(sortCollections), [data]);
  const latest = collections.find((c) => !c.locked) ?? collections[0];
  const recent = collections.filter((c) => c.id !== latest?.id).slice(0, 10);
  const readyRequest = karaokeRequests.find((request) => request.status === "READY" && request.matchedCollectionId);

  return (
    <VipShell>
      <div className="space-y-6">
        {activationPending && (
          <a
            href={activationWhatsappUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 rounded-[10px] border border-emerald-400/20 bg-emerald-400/[0.07] px-4 py-3 transition hover:bg-emerald-400/[0.10]"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-300">
              <MessageCircle className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] font-bold text-emerald-300">Tu registro VIP está listo</span>
              <span className="mt-0.5 block text-[11px] text-ink-secondary">Solicita por WhatsApp la activación de tu membresía anterior.</span>
            </span>
            <span className="shrink-0 text-[11px] font-bold text-primary">ACTIVAR →</span>
          </a>
        )}
        {readyRequest && (
          <Link
            to={`/panel/actualizaciones/${readyRequest.matchedCollectionId}?karaoke=${readyRequest.matchedKaraokeId ?? ""}`}
            className="flex items-center gap-3 rounded-[10px] border border-emerald-400/20 bg-emerald-400/[0.07] px-4 py-3 transition hover:bg-emerald-400/[0.10]"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-300">
              <BellRing className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] font-bold text-emerald-300">Tu karaoke solicitado ya está listo</span>
              <span className="mt-0.5 block truncate text-[11px] text-ink-secondary">
                {readyRequest.sourceAuthor ? `${readyRequest.sourceAuthor} - ` : ""}{readyRequest.sourceTitle ?? "Karaoke solicitado"}
                {readyRequest.matchedCollectionTitle ? ` · ${readyRequest.matchedCollectionTitle}` : ""}
              </span>
            </span>
            <span className="shrink-0 text-[11px] font-bold text-primary">Ver →</span>
          </Link>
        )}
        {isLoading && <div className="flex justify-center py-24"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
        {isError && <div className="rounded-[10px] border border-white/[0.06] bg-card p-12 text-center text-[13px] text-muted-foreground">No se pudo cargar el catâlogo.</div>}
        {latest && (
          <>
            <section className="overflow-hidden rounded-[10px] border border-white/[0.06] bg-card">
              <div className="flex flex-col gap-5 p-4 sm:flex-row sm:p-5">
                <div className="relative mx-auto aspect-square w-full max-w-[280px] shrink-0 overflow-hidden rounded-md bg-secondary sm:mx-0 sm:h-[280px] sm:w-[280px]">
                 <CoverArt year={latest.year} month={latest.month} fallbackUrl={latest.coverUrl} alt={latest.title} className="h-full w-full" />
                  <div className="absolute left-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-full bg-black/70 px-2 py-0.5 font-mono text-[10px] font-semibold text-primary backdrop-blur"><Crown className="h-3 w-3" /> TOP HITS</div>
                </div>
                <div className="flex min-w-0 flex-1 flex-col justify-center">
                  <div className="mb-2 inline-flex items-center gap-1.5 text-[12px] font-semibold text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> Actualización completada</div>
                  <h1 className="mb-1.5 text-2xl font-bold leading-tight sm:text-3xl">{latest.title}</h1>
                  <p className="mb-0.5 text-[13px] text-muted-foreground">Edición DJGABO</p>
                  <p className="mb-4 font-mono text-[11px] text-muted-foreground">{latest.karaokeCount} karaokes • Última subida: {shortDate(latest.updatedAt)}</p>
                  <div className="flex flex-wrap gap-2.5">
                    <Link to={`/panel/actualizaciones/${latest.id}`} className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-[13px] font-semibold text-black hover:brightness-95"><FolderOpen className="h-4 w-4" /> Ver paquete</Link>
                    <button onClick={() => hasVipAccess ? setDownload(latest) : setShowVip(true)} className="rounded-full border border-white/[0.12] px-4 py-2 text-[13px] font-medium hover:bg-white/[0.04]">Descargar todo</button>
                  </div>
                </div>
              </div>
            </section>

            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-lg font-bold">Última entrega <span className="rounded bg-primary px-1.5 py-0.5 font-mono text-[10px] font-bold text-black">NUEVO</span></h2>
                <Link to="/panel/actualizaciones" className="text-[13px] text-primary hover:underline">Ver todos →</Link>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-10">
                {recent.map((c) => <Link key={c.id} to={`/panel/actualizaciones/${c.id}`} className="group overflow-hidden rounded-[10px] border border-white/[0.06] bg-card hover:border-white/[0.12]">
                  <div className="aspect-square bg-secondary"><CoverArt year={c.year} month={c.month} fallbackUrl={c.coverUrl} alt={c.title} className={`h-full w-full ${c.locked ? "grayscale opacity-60" : ""}`} /></div>
                  <div className="p-2.5"><div className="truncate text-[12px] font-semibold group-hover:text-primary">{c.title}</div><div className="mt-0.5 font-mono text-[9px] text-muted-foreground">{c.karaokeCount} temas{c.locked ? " • BLOQUEADO" : ""}</div></div>
                </Link>)}
              </div>
            </section>

            {newestKaraokes.length > 0 && (
              <section>
                <h2 className="mb-3 text-lg font-bold">Karaokes Nuevos Agregados</h2>
                <div className="grid grid-cols-1 gap-x-7 gap-y-1 sm:grid-cols-2 xl:grid-cols-3">
                  {newestKaraokes.slice(0, 12).map((karaoke, index) => {
                    const display = publicKaraokeDisplay(karaoke);
                    return (
                      <Link
                        key={karaoke.id}
                        to={`/panel/actualizaciones/${karaoke.collectionId}?karaoke=${encodeURIComponent(karaoke.id)}`}
                        className="group flex min-w-0 items-center gap-3 border-b border-white/[0.06] py-2.5"
                      >
                        <span className="w-6 shrink-0 text-right font-mono text-[11px] font-bold text-muted-foreground">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <div className="h-11 w-11 shrink-0 overflow-hidden rounded-md bg-secondary">
                          {karaoke.coverUrl ? (
                            <img src={karaoke.coverUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-primary/10 text-[11px] font-black text-primary">DJ</div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-[12px] font-semibold group-hover:text-primary">{display.title}</div>
                          <div className="mt-0.5 truncate text-[10px] text-muted-foreground">{display.artist}</div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}
      </div>
      {download && <BatchDownloadModal collectionId={download.id} title={download.title} onClose={() => setDownload(null)} />}
      {showVip && <VipAccessModal onClose={() => setShowVip(false)} />}
    </VipShell>
  );
}
