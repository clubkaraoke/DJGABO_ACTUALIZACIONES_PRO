import { useQuery } from "@tanstack/react-query";
import type { CollectionSummaryDTO } from "@djgabo/shared";
import { api } from "../lib/apiClient";
import { ClientHeader } from "../components/ClientHeader";
import { CollectionCard } from "../components/CollectionCard";
import { Skeleton, EmptyState } from "../components/primitives";

export default function HomePage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["collections"],
    queryFn: () => api.get<CollectionSummaryDTO[]>("/collections"),
  });

  return (
    <div className="min-h-screen bg-carbon">
      <ClientHeader />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="font-display text-2xl font-bold text-ink">Mis actualizaciones</h1>
        <p className="mt-1 text-sm text-ink-secondary">Tus colecciones mensuales de karaoke, listas para abrir o descargar.</p>

        {isLoading && (
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="aspect-video w-full" />
            ))}
          </div>
        )}

        {isError && (
          <EmptyState title="No pudimos cargar tus colecciones" description="Verifica tu conexión e intenta de nuevo." />
        )}

        {data && data.length === 0 && (
          <EmptyState title="Todavía no tienes colecciones" description="Cuando el administrador te dé acceso, aparecerán aquí." />
        )}

        {data && data.length > 0 && (
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.map((c) => (
              <CollectionCard key={c.id} collection={c} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
