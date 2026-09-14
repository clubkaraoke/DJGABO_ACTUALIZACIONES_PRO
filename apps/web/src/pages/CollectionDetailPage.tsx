import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { CollectionDetailDTO } from "@djgabo/shared";
import { api, ApiError } from "../lib/apiClient";
import { ClientHeader } from "../components/ClientHeader";
import { SearchBar } from "../components/SearchBar";
import { KaraokeCard } from "../components/KaraokeCard";
import { KaraokeRow } from "../components/KaraokeRow";
import { BatchDownloadModal } from "../components/BatchDownloadModal";
import { Button, EmptyState, Skeleton } from "../components/primitives";

type ViewMode = "grid" | "list";
type SortMode = "title" | "artist";

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
      list = list.filter(
        (k) => k.title.toLowerCase().includes(q) || k.artist.toLowerCase().includes(q) || k.code.toLowerCase().includes(q),
      );
    }
    return [...list].sort((a, b) => (sort === "title" ? a.title.localeCompare(b.title) : a.artist.localeCompare(b.artist)));
  }, [data, query, sort]);

  if (error instanceof ApiError) {
    return (
      <div className="min-h-screen bg-carbon">
        <ClientHeader />
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <EmptyState
            title={error.statusCode === 403 ? "No tienes acceso a esta colección" : "Colección no encontrada"}
            description={error.message}
            action={
              <Link to="/">
                <Button variant="secondary">Volver a mis actualizaciones</Button>
              </Link>
            }
          />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-carbon">
      <ClientHeader />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <Link to="/" className="text-sm text-ink-secondary hover:text-ink">
          ← Mis actualizaciones
        </Link>

        {isLoading && (
          <div className="mt-4 space-y-4">
            <Skeleton className="h-8 w-64" />
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="aspect-square w-full" />
              ))}
            </div>
          </div>
        )}

        {data && (
          <>
            <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="font-display text-2xl font-bold text-ink">{data.collection.title.toUpperCase()}</h1>
                <p className="text-sm text-ink-secondary">{data.collection.karaokeCount} karaokes</p>
              </div>
              <Button variant="primary" onClick={() => setShowBatch(true)}>
                Descargar todo
              </Button>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <SearchBar value={query} onChange={setQuery} />
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortMode)}
                className="rounded-md border border-graphite-border bg-graphite-elevated px-3 py-2 text-sm text-ink"
              >
                <option value="title">Ordenar por título</option>
                <option value="artist">Ordenar por artista</option>
              </select>
              <div className="ml-auto flex rounded-md border border-graphite-border p-0.5">
                <button
                  onClick={() => setView("grid")}
                  className={`rounded px-3 py-1.5 text-xs font-medium ${view === "grid" ? "bg-accent text-carbon" : "text-ink-secondary"}`}
                >
                  Tarjetas
                </button>
                <button
                  onClick={() => setView("list")}
                  className={`rounded px-3 py-1.5 text-xs font-medium ${view === "list" ? "bg-accent text-carbon" : "text-ink-secondary"}`}
                >
                  Lista
                </button>
              </div>
            </div>

            {filtered.length === 0 && (
              <div className="mt-8">
                <EmptyState title="Sin resultados" description={`No encontramos karaokes que coincidan con "${query}".`} />
              </div>
            )}

            {filtered.length > 0 && view === "grid" && (
              <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                {filtered.map((k) => (
                  <KaraokeCard key={k.id} karaoke={k} />
                ))}
              </div>
            )}

            {filtered.length > 0 && view === "list" && (
              <div className="mt-6 overflow-x-auto rounded-lg border border-graphite-border">
                <table className="w-full min-w-[640px]">
                  <thead>
                    <tr className="border-b border-graphite-border bg-graphite text-left text-xs uppercase tracking-wide text-ink-tertiary">
                      <th className="px-4 py-3 font-medium">Título</th>
                      <th className="px-4 py-3 font-medium">Artista</th>
                      <th className="px-4 py-3 font-medium">Código</th>
                      <th className="px-4 py-3 font-medium">Fecha</th>
                      <th className="px-4 py-3 font-medium">Tamaño</th>
                      <th className="px-4 py-3 font-medium">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((k) => (
                      <KaraokeRow key={k.id} karaoke={k} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {showBatch && (
              <BatchDownloadModal collectionId={data.collection.id} title={data.collection.title} onClose={() => setShowBatch(false)} />
            )}
          </>
        )}
      </main>
    </div>
  );
}
