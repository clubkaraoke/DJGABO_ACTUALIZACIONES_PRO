import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock3, ExternalLink, Loader2, PlayCircle, XCircle } from "lucide-react";
import { api, ApiError } from "../../lib/apiClient";

type RequestStatus = "REQUESTED" | "IN_PROGRESS" | "READY" | "REJECTED";

interface KaraokeRequest {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  youtubeUrl: string;
  sourceTitle: string | null;
  sourceAuthor: string | null;
  status: RequestStatus;
  matchedKaraokeId: string | null;
  matchedCollectionId: string | null;
  matchedCollectionTitle: string | null;
  createdAt: string;
  updatedAt: string;
  readyAt: string | null;
}

const STATUS: Record<RequestStatus, { label: string; className: string }> = {
  REQUESTED: { label: "Solicitado", className: "border-white/[0.08] bg-white/[0.04] text-ink-secondary" },
  IN_PROGRESS: { label: "En preparación", className: "border-amber-400/20 bg-amber-400/10 text-amber-300" },
  READY: { label: "Listo", className: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300" },
  REJECTED: { label: "No disponible", className: "border-red-400/20 bg-red-400/10 text-red-300" },
};

function formatDate(value: string) {
  return new Date(value).toLocaleString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminRequestsPage() {
  const queryClient = useQueryClient();
  const { data = [], isLoading, error } = useQuery({
    queryKey: ["admin", "karaoke-requests"],
    queryFn: () => api.get<KaraokeRequest[]>("/admin/karaoke-requests"),
    refetchInterval: 30000,
  });

  async function changeStatus(id: string, status: RequestStatus) {
    try {
      await api.patch("/admin/karaoke-requests/" + id, { status });
      await queryClient.invalidateQueries({ queryKey: ["admin", "karaoke-requests"] });
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : "No se pudo actualizar el pedido.");
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Solicitudes de clientes</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-[-0.03em] text-foreground">Karaokes a pedido</h1>
          <p className="mt-1 text-[12px] text-muted-foreground">Cada pedido queda vinculado a la cuenta que lo solicitó.</p>
        </div>
        <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 font-mono text-[10px] text-ink-secondary">
          {data.length} PEDIDOS
        </span>
      </header>

      <div className="overflow-hidden rounded-[12px] border border-white/[0.07] bg-card">
        {isLoading ? (
          <div className="flex justify-center py-14"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : error ? (
          <div className="p-8 text-center text-[13px] text-red-300">No se pudieron cargar los pedidos.</div>
        ) : data.length === 0 ? (
          <div className="p-10 text-center">
            <Clock3 className="mx-auto h-5 w-5 text-ink-tertiary" />
            <p className="mt-2 text-[13px] font-semibold text-foreground">No hay pedidos pendientes</p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {data.map((item) => {
              const status = STATUS[item.status];
              return (
                <article key={item.id} className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(220px,.8fr)_auto] lg:items-center lg:px-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={"rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide " + status.className}>
                        {status.label}
                      </span>
                      <span className="font-mono text-[10px] text-ink-tertiary">{formatDate(item.createdAt)}</span>
                    </div>
                    <p className="mt-2 truncate text-[13px] font-semibold text-foreground">{item.sourceTitle || "Video de YouTube"}</p>
                    {item.sourceAuthor && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{item.sourceAuthor}</p>}
                    <a href={item.youtubeUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline">
                      Abrir YouTube <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>

                  <div className="min-w-0 rounded-[9px] border border-white/[0.06] bg-background/60 px-3 py-2.5">
                    <p className="truncate text-[12px] font-semibold text-foreground">{item.userName}</p>
                    <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{item.userEmail}</p>
                    {item.status === "READY" && item.matchedCollectionTitle && (
                      <p className="mt-2 text-[10px] font-semibold text-emerald-300">
                        Publicado en {item.matchedCollectionTitle}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    {item.status === "REQUESTED" && (
                      <button onClick={() => void changeStatus(item.id, "IN_PROGRESS")} className="inline-flex items-center gap-1.5 rounded-md border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-[11px] font-bold text-amber-300 hover:bg-amber-400/15">
                        <PlayCircle className="h-3.5 w-3.5" /> Preparar
                      </button>
                    )}
                    {item.status !== "READY" && item.status !== "REJECTED" && (
                      <button onClick={() => void changeStatus(item.id, "REJECTED")} className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.08] px-3 py-2 text-[11px] font-semibold text-ink-secondary hover:bg-white/[0.04]">
                        <XCircle className="h-3.5 w-3.5" /> No disponible
                      </button>
                    )}
                    {item.status === "READY" && item.matchedCollectionId && (
                      <a href={"/panel/actualizaciones/" + item.matchedCollectionId + "?karaoke=" + (item.matchedKaraokeId || "")} className="inline-flex items-center gap-1.5 rounded-md bg-emerald-400/10 px-3 py-2 text-[11px] font-bold text-emerald-300 hover:bg-emerald-400/15">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Ver publicado
                      </a>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <p className="text-[10px] leading-5 text-ink-tertiary">
        Los pedidos abiertos se vuelven a comprobar contra el catálogo al cargar esta pantalla. Si el karaoke aparece publicado con coincidencia de artista y título, cambia automáticamente a LISTO.
      </p>
    </div>
  );
}
