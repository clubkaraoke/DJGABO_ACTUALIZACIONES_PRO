import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { CollectionSummaryDTO, KaraokeSummaryDTO } from "@djgabo/shared";
import { FolderOpen, Loader2 } from "lucide-react";
import { api } from "../lib/apiClient";
import { VipShell } from "../components/VipShell";
import { publicFolderAlias, publicKaraokeDisplay, publicSearchMatches } from "../lib/publicCatalogPresentation";

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") || "";

  const { data = [], isLoading } = useQuery({
    queryKey: ["karaoke-search", q],
    queryFn: () => api.get<KaraokeSummaryDTO[]>(`/karaokes/search?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length > 0,
  });

  const { data: collections = [] } = useQuery({
    queryKey: ["collections"],
    queryFn: () => api.get<CollectionSummaryDTO[]>("/collections"),
  });

  const collectionById = useMemo(
    () => new Map(collections.map((collection) => [collection.id, collection])),
    [collections],
  );

  // El seed heredado vive en la raíz mensual (__GENERAL__) y no forma parte
  // del catálogo real que se expone al cliente. Las fuentes reales se
  // muestran únicamente mediante los cinco aliases aprobados.
  const visibleData = useMemo(
    () =>
      data.filter((karaoke) => {
        const folder = publicFolderAlias(karaoke.sourceGroup);
        return Boolean(folder) && publicSearchMatches(karaoke, q);
      }),
    [data, q],
  );

  return (
    <VipShell
      searchValue={q}
      onSearchChange={(value) => setParams(value ? { q: value } : {})}
      searchPlaceholder="Buscar karaoke, artista o código..."
    >
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-bold">Buscar karaokes</h1>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Encuentra si un karaoke está disponible y en qué actualización y carpeta se encuentra.
          </p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !q ? (
          <div className="rounded-[10px] border border-white/[0.06] bg-card py-16 text-center text-[13px] text-muted-foreground">
            Escribe una canción, artista o código.
          </div>
        ) : visibleData.length === 0 ? (
          <div className="rounded-[10px] border border-white/[0.06] bg-card py-16 text-center text-[13px] text-muted-foreground">
            No se encontraron resultados para “{q}”.
          </div>
        ) : (
          <div className="overflow-hidden rounded-[10px] border border-white/[0.06] bg-card">
            {visibleData.map((karaoke) => {
              const display = publicKaraokeDisplay(karaoke);
              const collection = collectionById.get(karaoke.collectionId);
              const folder = publicFolderAlias(karaoke.sourceGroup)!;
              const href = `/panel/actualizaciones/${karaoke.collectionId}?folder=${encodeURIComponent(folder)}&karaoke=${encodeURIComponent(karaoke.id)}`;

              return (
                <Link
                  key={karaoke.id}
                  to={href}
                  className="group flex items-center gap-3 border-b border-white/[0.06] px-4 py-3 last:border-0 hover:bg-white/[0.04]"
                >
                  <FolderOpen className="h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold group-hover:text-primary" title={display.label}>
                      {display.label}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                      {collection && <span>{collection.title}</span>}
                      {collection && <span>·</span>}
                      <span className="font-medium text-primary/90">{folder}</span>
                      <span>·</span>
                      <span className="font-mono text-[10px]">{karaoke.code}</span>
                    </div>
                  </div>
                  <span className="text-muted-foreground">→</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </VipShell>
  );
}
