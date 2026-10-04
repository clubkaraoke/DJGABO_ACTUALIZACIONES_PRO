import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { CollectionDetailDTO, KaraokeSummaryDTO } from "@djgabo/shared";
import { ChevronDown, ChevronRight, Folder, Loader2, Share2 } from "lucide-react";
import { api, ApiError } from "../lib/apiClient";
import { CoverArt } from "../components/CoverArt";
import { VipShell } from "../components/VipShell";
import { KaraokeRow } from "../components/KaraokeRow";
import { BatchDownloadModal } from "../components/BatchDownloadModal";
import { EmptyState } from "../components/primitives";

interface CatalogMonthDocument {
  schema_version: 1;
  version: string;
  updated_at: string;
  year: number;
  month: number;
  collection: {
    id: string;
    slug: string;
    title: string;
    cover_url: string | null;
    active: boolean;
  } | null;
  brands: Array<{ name: string; slug: string; count: number }>;
  karaokes: Array<{
    id: string;
    code: string;
    artist: string;
    title: string;
    format: string | null;
    size: number | null;
    cover_url: string | null;
    brand: string;
  }>;
}

function fallbackGroupLabel(group?: string | null): string {
  if (!group || group === "__GENERAL__") return "DJGABO";

  const normalized = group.replace(/_/g, " ").trim();
  const prefixed = normalized.match(/^(\d{1,2})[ .-]+(.+)$/);
  if (prefixed) {
    return `${prefixed[1]!.padStart(2, "0")} · ${prefixed[2]!.trim()}`;
  }
  return normalized;
}

function formatUpdatedAt(iso: string): string {
  return new Date(iso).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export default function CollectionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [showBatch, setShowBatch] = useState(false);

  const {
    data,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["collection", id],
    queryFn: () => api.get<CollectionDetailDTO>(`/collections/${id}`),
    enabled: Boolean(id),
    retry: false,
  });

  const { data: catalog } = useQuery({
    queryKey: ["catalog-month", data?.collection.year, data?.collection.month],
    queryFn: () =>
      api.get<CatalogMonthDocument>(
        `/catalog/${data!.collection.year}/${String(data!.collection.month).padStart(2, "0")}/index.json`,
      ),
    enabled: Boolean(data),
    retry: false,
    staleTime: 10_000,
  });

  const groups = useMemo(() => {
    if (!data) return [] as Array<[string, KaraokeSummaryDTO[]]>;

    const search = query.trim().toLowerCase();
    const brandByKaraokeId = new Map(
      (catalog?.karaokes ?? []).map((karaoke) => [karaoke.id, karaoke.brand]),
    );

    const map = new Map<string, KaraokeSummaryDTO[]>();

    // El JSON mensual es la fuente de verdad visual de las carpetas.
    // Se siembran incluso las marcas con count=0 para que la estructura
    // de Dropbox/maestro no desaparezca de la interfaz.
    if (!search) {
      for (const brand of catalog?.brands ?? []) map.set(brand.name, []);
    }

    for (const karaoke of data.karaokes) {
      const brand =
        brandByKaraokeId.get(karaoke.id) ??
        fallbackGroupLabel(karaoke.sourceGroup);

      const matchesSearch =
        !search ||
        brand.toLowerCase().includes(search) ||
        [karaoke.title, karaoke.artist, karaoke.code, karaoke.format ?? ""]
          .some((value) => value.toLowerCase().includes(search));

      if (!matchesSearch) continue;

      const items = map.get(brand) ?? [];
      items.push(karaoke);
      map.set(brand, items);
    }

    const order = new Map(
      (catalog?.brands ?? []).map((brand, index) => [brand.name, index]),
    );

    return [...map.entries()]
      .filter(([, items]) => !search || items.length > 0)
      .sort(([a], [b]) => {
        const ai = order.get(a);
        const bi = order.get(b);
        if (ai !== undefined && bi !== undefined) return ai - bi;
        if (ai !== undefined) return -1;
        if (bi !== undefined) return 1;
        return a.localeCompare(b, "es", { numeric: true, sensitivity: "base" });
      });
  }, [data, catalog, query]);

  if (error instanceof ApiError) {
    return (
      <VipShell>
        <div className="mx-auto max-w-4xl">
          <EmptyState
            title={error.statusCode === 403 ? "No tienes acceso a esta actualización" : "Actualización no encontrada"}
            description={error.message}
          />
        </div>
      </VipShell>
    );
  }

  return (
    <VipShell
      searchValue={query}
      onSearchChange={setQuery}
      searchPlaceholder="Buscar karaoke, artista, código o carpeta..."
    >
      <div className="space-y-5">
        <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
          <Link to="/panel/actualizaciones" className="hover:text-foreground">
            Actualizaciones
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="truncate text-foreground">{data?.collection.title || "Cargando..."}</span>
        </div>

        {isLoading && (
          <div className="flex justify-center py-20">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {data && (
          <>
            <div className="flex flex-col gap-4 rounded-[10px] border border-white/[0.06] bg-card p-4 sm:flex-row">
              <div className="h-28 w-28 shrink-0 overflow-hidden rounded-md bg-secondary">
                <CoverArt
                  year={data.collection.year}
                  month={data.collection.month}
                  fallbackUrl={data.collection.coverUrl}
                  alt={data.collection.title}
                  className="h-full w-full"
                />
              </div>

              <div className="min-w-0 flex-1">
                <h1 className="mb-2.5 truncate text-xl font-bold">{data.collection.title}</h1>

                <dl className="grid gap-x-6 gap-y-1 text-[12px] sm:grid-cols-2">
                  <div className="flex gap-2">
                    <dt className="text-muted-foreground">Colección:</dt>
                    <dd>Actualizaciones VIP</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-muted-foreground">Categoría:</dt>
                    <dd>Ediciones DJGABO</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-muted-foreground">Karaokes:</dt>
                    <dd className="font-mono">{data.collection.karaokeCount}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-muted-foreground">Carpetas:</dt>
                    <dd className="font-mono">{catalog?.brands.length ?? groups.length}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-muted-foreground">Estado:</dt>
                    <dd className="text-emerald-400">Actualización completada</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-muted-foreground">Última actualización:</dt>
                    <dd>{formatUpdatedAt(data.collection.updatedAt)}</dd>
                  </div>
                </dl>

                <div className="mt-3.5 flex flex-wrap gap-2.5">
                  <button
                    onClick={() => navigator.clipboard?.writeText(window.location.href)}
                    className="inline-flex items-center gap-2 rounded-md border border-white/[0.12] px-3.5 py-2 text-[13px] font-medium hover:bg-white/[0.04]"
                  >
                    <Share2 className="h-3.5 w-3.5" />
                    Compartir
                  </button>
                  {!data.collection.locked && (
                    <button
                      onClick={() => setShowBatch(true)}
                      className="rounded-md bg-primary px-3.5 py-2 text-[13px] font-semibold text-black hover:brightness-95"
                    >
                      Descargar todo
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-[10px] border border-white/[0.06] bg-card">
              {groups.length === 0 ? (
                <div className="px-4 py-10 text-center text-[13px] text-muted-foreground">
                  No hay resultados.
                </div>
              ) : (
                groups.map(([name, karaokes], index) => {
                  const expanded = open === name || (open === null && index === 0);

                  return (
                    <div key={name} className="border-b border-white/[0.06] last:border-0">
                      <button
                        onClick={() => setOpen(expanded ? "__CLOSED__" : name)}
                        className="flex w-full items-center gap-2.5 px-3.5 py-2.5 hover:bg-white/[0.04]"
                      >
                        {expanded ? (
                          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        <Folder className="h-4 w-4 shrink-0 text-primary" />
                        <span className="flex-1 truncate text-left text-[13px] font-semibold">{name}</span>
                        <span className="font-mono text-[11px] text-muted-foreground">{karaokes.length}</span>
                      </button>

                      {expanded && (
                        <div className="border-t border-white/[0.06]">
                          {karaokes.length === 0 ? (
                            <div className="px-10 py-6 text-[12px] text-muted-foreground">
                              Esta carpeta todavía no contiene karaokes.
                            </div>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="w-full min-w-[760px]">
                                <thead>
                                  <tr className="border-b border-white/[0.06] text-left font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                                    <th className="w-[56px] px-4 py-2.5">Cover</th>
                                    <th className="px-4 py-2.5">Karaoke</th>
                                    <th className="px-4 py-2.5">Código</th>
                                    <th className="px-4 py-2.5">Formato</th>
                                    <th className="px-4 py-2.5">Tamaño</th>
                                    <th className="px-4 py-2.5">Acciones</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {karaokes.map((karaoke) => (
                                    <KaraokeRow key={karaoke.id} karaoke={karaoke} />
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {showBatch && (
              <BatchDownloadModal
                collectionId={data.collection.id}
                title={data.collection.title}
                onClose={() => setShowBatch(false)}
              />
            )}
          </>
        )}
      </div>
    </VipShell>
  );
}
