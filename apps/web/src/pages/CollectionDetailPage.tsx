import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { CollectionDetailDTO } from "@djgabo/shared";
import { api, ApiError } from "../lib/apiClient";
import { ClientPortalShell } from "../components/ClientPortalShell";
import { KaraokeCard } from "../components/KaraokeCard";
import { KaraokeRow } from "../components/KaraokeRow";
import { BatchDownloadModal } from "../components/BatchDownloadModal";
import { Button, EmptyState, Skeleton } from "../components/primitives";

type ViewMode = "grid" | "list";
type SortMode = "title" | "artist";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
}

export default function CollectionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewMode>("grid");
  const [sort, setSort] = useState<SortMode>("title");
  const [showBatch, setShowBatch] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["collection", id],
    queryFn: () => api.get<CollectionDetailDTO>(`/collections/${id}`),
    enabled: Boolean(id),
    retry: false,
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    let list = data.karaokes;
    if (q) {
      list = list.filter((k) => k.title.toLowerCase().includes(q) || k.artist.toLowerCase().includes(q) || k.code.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => (sort === "title" ? a.title.localeCompare(b.title) : a.artist.localeCompare(b.artist)));
  }, [data, query, sort]);

  if (error instanceof ApiError) {
    return (
      <ClientPortalShell active="actualizaciones">
        <div className="mx-auto max-w-[1500px]">
          <EmptyState
            title={error.statusCode === 403 ? "No tienes acceso a esta actualización" : "Actualización no encontrada"}
            description={error.message}
            action={<Link to="/"><Button variant="secondary">Volver al inicio</Button></Link>}
          />
        </div>
      </ClientPortalShell>
    );
  }

  return (
    <ClientPortalShell
      active="actualizaciones"
      searchValue={query}
      onSearchChange={setQuery}
      searchPlaceholder="Buscar karaoke, artista o código..."
    >
      <div className="mx-auto max-w-[1500px] space-y-6">
        <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium text-ink-secondary hover:text-accent">← Volver al inicio</Link>

        {isLoading && (
          <div className="space-y-5">
            <Skeleton className="h-56 w-full rounded-xl" />
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
              {Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="aspect-square w-full" />)}
            </div>
          </div>
        )}

        {data && (
          <>
            <section className="relative overflow-hidden rounded-2xl border border-graphite-border bg-graphite p-6 sm:p-8">
              <div className="absolute inset-y-0 right-0 w-1/2 opacity-25">
                {data.collection.coverUrl && <img src={data.collection.coverUrl} alt="" className="h-full w-full object-cover" />}
                <div className="absolute inset-0 bg-gradient-to-r from-graphite via-graphite/60 to-transparent" />
              </div>
              <div className="relative max-w-3xl">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent">Actualización mensual</span>
                <h1 className="mt-2 font-display text-3xl font-extrabold text-ink sm:text-4xl">{data.collection.title}</h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-secondary">{data.collection.description ?? "Revisa la colección completa, escucha los previews disponibles y descarga los karaokes incluidos en tu membresía."}</p>
                <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-secondary">
                  <span><strong className="text-ink">{data.collection.karaokeCount}</strong> karaokes</span>
                  <span>Actualizado {formatDate(data.collection.updatedAt)}</span>
                  {data.collection.publishedAt && <span>Publicado {formatDate(data.collection.publishedAt)}</span>}
                </div>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Button variant="primary" onClick={() => setShowBatch(true)}>Descargar actualización</Button>
                  <span className="inline-flex items-center rounded-lg border border-graphite-border bg-carbon/40 px-4 py-2 text-xs font-medium text-ink-secondary">Busca arriba por título, artista o código</span>
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-graphite-border bg-graphite p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-3">
                <div className="mr-auto">
                  <h2 className="font-display text-lg font-bold text-ink">Karaokes de esta actualización</h2>
                  <p className="mt-1 text-xs text-ink-secondary">{filtered.length} de {data.karaokes.length} resultados</p>
                </div>
                <select value={sort} onChange={(e) => setSort(e.target.value as SortMode)} className="rounded-lg border border-graphite-border bg-carbon px-3 py-2 text-sm text-ink">
                  <option value="title">Ordenar por título</option>
                  <option value="artist">Ordenar por artista</option>
                </select>
                <div className="flex rounded-lg border border-graphite-border bg-carbon p-1">
                  <button onClick={() => setView("grid")} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${view === "grid" ? "bg-accent text-carbon" : "text-ink-secondary hover:text-ink"}`}>Tarjetas</button>
                  <button onClick={() => setView("list")} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${view === "list" ? "bg-accent text-carbon" : "text-ink-secondary hover:text-ink"}`}>Lista</button>
                </div>
              </div>
            </section>

            {filtered.length === 0 && <EmptyState title="Sin resultados" description={`No encontramos karaokes que coincidan con "${query}".`} />}

            {filtered.length > 0 && view === "grid" && (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                {filtered.map((k) => <KaraokeCard key={k.id} karaoke={k} />)}
              </div>
            )}

            {filtered.length > 0 && view === "list" && (
              <div className="overflow-x-auto rounded-xl border border-graphite-border bg-graphite">
                <table className="w-full min-w-[760px]">
                  <thead>
                    <tr className="border-b border-graphite-border bg-carbon/60 text-left text-xs uppercase tracking-wide text-ink-tertiary">
                      <th className="px-4 py-3 font-medium">Título</th>
                      <th className="px-4 py-3 font-medium">Artista</th>
                      <th className="px-4 py-3 font-medium">Código</th>
                      <th className="px-4 py-3 font-medium">Fecha</th>
                      <th className="px-4 py-3 font-medium">Tamaño</th>
                      <th className="px-4 py-3 font-medium">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>{filtered.map((k) => <KaraokeRow key={k.id} karaoke={k} />)}</tbody>
                </table>
              </div>
            )}

            {showBatch && <BatchDownloadModal collectionId={data.collection.id} title={data.collection.title} onClose={() => setShowBatch(false)} />}
          </>
        )}
      </div>
    </ClientPortalShell>
  );
}
