import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { KaraokeSummaryDTO } from "@djgabo/shared";
import { FolderOpen, Loader2 } from "lucide-react";
import { api } from "../lib/apiClient";
import { VipShell } from "../components/VipShell";
import { publicKaraokeDisplay, publicSearchMatches } from "../lib/publicCatalogPresentation";

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") || "";
  const { data = [], isLoading } = useQuery({
    queryKey: ["karaoke-search", q],
    queryFn: () => api.get<KaraokeSummaryDTO[]>(`/karaokes/search?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length > 0,
  });

  // El backend puede encontrar coincidencias por el nombre físico indexado.
  // Antes de renderizar, volvemos a filtrar únicamente por los valores
  // públicos para que buscar una firma/marca oculta no revele resultados.
  const visibleData = useMemo(
    () => data.filter((karaoke) => publicSearchMatches(karaoke, q)),
    [data, q],
  );
  const value = useMemo(() => q, [q]);

  return (
    <VipShell
      searchValue={value}
      onSearchChange={(v) => setParams(v ? { q: v } : {})}
      searchPlaceholder="Buscar karaoke, artista o código..."
    >
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-bold">Buscar karaokes</h1>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Busca por canción, artista o código dentro de tus colecciones habilitadas.
          </p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !q ? (
          <div className="rounded-[10px] border border-white/[0.06] bg-card py-16 text-center text-[13px] text-muted-foreground">
            Escribe una búsqueda arriba.
          </div>
        ) : visibleData.length === 0 ? (
          <div className="rounded-[10px] border border-white/[0.06] bg-card py-16 text-center text-[13px] text-muted-foreground">
            No se encontraron resultados para “{q}”.
          </div>
        ) : (
          <div className="overflow-hidden rounded-[10px] border border-white/[0.06] bg-card">
            {visibleData.map((karaoke) => {
              const display = publicKaraokeDisplay(karaoke);
              return (
                <Link
                  key={karaoke.id}
                  to={`/panel/actualizaciones/${karaoke.collectionId}`}
                  className="group flex items-center gap-3 border-b border-white/[0.06] px-4 py-2.5 last:border-0 hover:bg-white/[0.04]"
                >
                  <FolderOpen className="h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] group-hover:text-primary" title={display.label}>
                      {display.label}
                    </div>
                    <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                      {karaoke.code}
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
