import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock3, ExternalLink, Loader2, Music2, SearchCheck, Sparkles, Youtube } from "lucide-react";
import { Link } from "react-router-dom";
import { VipShell } from "../components/VipShell";
import { api, ApiError } from "../lib/apiClient";

type RequestStatus = "REQUESTED" | "IN_PROGRESS" | "READY" | "REJECTED";

interface KaraokeRequest {
  id: string;
  youtubeUrl: string;
  sourceTitle: string | null;
  sourceAuthor: string | null;
  status: RequestStatus;
  matchedKaraokeId: string | null;
  matchedCollectionId: string | null;
  matchedCollectionTitle: string | null;
  createdAt: string;
  readyAt: string | null;
}

interface CreateResponse {
  alreadyAvailable: boolean;
  duplicate?: boolean;
  request?: KaraokeRequest;
  match?: {
    karaokeId: string;
    title: string;
    artist: string;
    collectionId: string;
    collectionTitle: string;
    year: number;
    month: number;
  };
}

const STATUS: Record<RequestStatus, { label: string; className: string }> = {
  REQUESTED: { label: "Solicitado", className: "border-white/[0.08] bg-white/[0.04] text-ink-secondary" },
  IN_PROGRESS: { label: "En preparación", className: "border-amber-400/20 bg-amber-400/10 text-amber-300" },
  READY: { label: "Listo", className: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300" },
  REJECTED: { label: "No disponible", className: "border-red-400/20 bg-red-400/10 text-red-300" },
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function OrderPage() {
  const queryClient = useQueryClient();
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [available, setAvailable] = useState<CreateResponse["match"] | null>(null);

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["karaoke-requests"],
    queryFn: () => api.get<KaraokeRequest[]>("/karaoke-requests"),
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = youtubeUrl.trim();
    if (!value || submitting) return;

    setSubmitting(true);
    setMessage("");
    setAvailable(null);
    try {
      const result = await api.post<CreateResponse>("/karaoke-requests", { youtubeUrl: value });
      if (result.alreadyAvailable && result.match) {
        setAvailable(result.match);
        setMessage("Este karaoke ya está disponible en tu catálogo.");
      } else if (result.duplicate) {
        setMessage("Ya habías solicitado esta canción. Conservamos el pedido anterior.");
      } else {
        setMessage("Solicitud enviada. Te avisaremos aquí cuando el karaoke esté listo.");
        setYoutubeUrl("");
      }
      await queryClient.invalidateQueries({ queryKey: ["karaoke-requests"] });
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "No se pudo registrar la solicitud.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <VipShell>
      <div className="mx-auto max-w-[920px] space-y-7 py-2 sm:py-5">
        <header className="text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/[0.12] text-primary">
            <Sparkles className="h-5 w-5" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-[-0.035em] text-foreground sm:text-4xl">
            Solicita tu karaoke
          </h1>
          <p className="mx-auto mt-2 max-w-[620px] text-[14px] leading-6 text-muted-foreground">
            ¿No encuentras una canción? Envíanos el enlace de YouTube y la prepararemos para una próxima actualización.
          </p>
        </header>

        <section className="rounded-[14px] border border-white/[0.08] bg-card p-4 shadow-card sm:p-6">
          <div className="mb-4 inline-flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/[0.08] px-3 py-2 text-[12px] font-semibold text-primary">
            <Youtube className="h-4 w-4" /> Enlace de YouTube
          </div>

          <form onSubmit={submit}>
            <div className="relative">
              <Youtube className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-tertiary" />
              <input
                value={youtubeUrl}
                onChange={(event) => setYoutubeUrl(event.target.value)}
                placeholder="https://youtu.be/..."
                inputMode="url"
                autoComplete="off"
                className="h-[58px] w-full rounded-[10px] border border-white/[0.09] bg-background pl-12 pr-4 text-[14px] text-foreground outline-none transition placeholder:text-ink-tertiary focus:border-primary/50 focus:ring-2 focus:ring-primary/[0.08]"
              />
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Antes de crear el pedido comprobamos si la canción ya existe en Actualizaciones PRO.
            </p>

            <button
              type="submit"
              disabled={!youtubeUrl.trim() || submitting}
              className="mt-5 inline-flex h-[44px] min-w-[190px] items-center justify-center gap-2 rounded-md bg-primary px-5 text-[13px] font-bold text-black transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Music2 className="h-4 w-4" />}
              {submitting ? "Comprobando…" : "Solicitar karaoke"}
            </button>
          </form>

          {message && (
            <div className={"mt-5 rounded-[10px] border p-4 text-[13px] " + (available ? "border-emerald-400/20 bg-emerald-400/[0.08]" : "border-white/[0.07] bg-white/[0.03]")}>
              <div className="flex items-start gap-3">
                {available ? <SearchCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" /> : <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground">{message}</p>
                  {available && (
                    <>
                      <p className="mt-1 text-muted-foreground">
                        {available.artist} - {available.title} · {available.collectionTitle}
                      </p>
                      <Link
                        to={"/panel/actualizaciones/" + available.collectionId + "?karaoke=" + available.karaokeId}
                        className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-bold text-primary hover:underline"
                      >
                        Ver karaoke <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[16px] font-bold tracking-tight text-foreground">Mis solicitudes</h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Seguimiento de los karaokes solicitados desde tu cuenta.</p>
            </div>
            <span className="font-mono text-[10px] text-ink-tertiary">{requests.length} PEDIDOS</span>
          </div>

          <div className="overflow-hidden rounded-[12px] border border-white/[0.07] bg-card">
            {isLoading ? (
              <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
            ) : requests.length === 0 ? (
              <div className="px-5 py-9 text-center">
                <Clock3 className="mx-auto h-5 w-5 text-ink-tertiary" />
                <p className="mt-2 text-[13px] font-semibold text-foreground">Todavía no tienes solicitudes</p>
                <p className="mt-1 text-[11px] text-muted-foreground">Tus pedidos aparecerán aquí con su estado.</p>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.06]">
                {requests.map((item) => {
                  const status = STATUS[item.status];
                  return (
                    <div key={item.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-foreground">
                          {item.sourceTitle || "Canción solicitada"}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                          {item.sourceAuthor && <span>{item.sourceAuthor}</span>}
                          <span>{formatDate(item.createdAt)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={"rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide " + status.className}>
                          {status.label}
                        </span>
                        {item.status === "READY" && item.matchedCollectionId && (
                          <Link
                            to={"/panel/actualizaciones/" + item.matchedCollectionId + "?karaoke=" + (item.matchedKaraokeId || "")}
                            className="text-[11px] font-bold text-primary hover:underline"
                          >
                            Ver ahora
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </VipShell>
  );
}
