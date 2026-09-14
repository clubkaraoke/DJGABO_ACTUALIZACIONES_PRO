import { useQuery } from "@tanstack/react-query";
import type { AdminDashboardStatsDTO } from "@djgabo/shared";
import { api } from "../../lib/apiClient";
import { Skeleton } from "../../components/primitives";

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-graphite-border bg-graphite p-5">
      <p className="text-xs uppercase tracking-wide text-ink-tertiary">{label}</p>
      <p className="mt-1 font-display text-3xl font-bold text-ink">{value}</p>
    </div>
  );
}

export default function AdminDashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "dashboard"],
    queryFn: () => api.get<AdminDashboardStatsDTO>("/admin/dashboard"),
  });

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h1 className="font-display text-2xl font-bold text-ink">Dashboard</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Descargas hoy" value={data.downloadsToday} />
        <StatCard label="Descargas esta semana" value={data.downloadsThisWeek} />
        <StatCard label="Usuarios activos" value={data.activeUsers} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-graphite-border bg-graphite p-5">
          <h2 className="mb-3 font-display text-base font-semibold text-ink">Karaokes más descargados</h2>
          {data.topKaraokes.length === 0 ? (
            <p className="text-sm text-ink-secondary">Todavía no hay descargas registradas.</p>
          ) : (
            <ul className="space-y-2">
              {data.topKaraokes.map((k) => (
                <li key={k.id} className="flex items-center justify-between text-sm">
                  <span className="truncate text-ink">
                    {k.title} <span className="text-ink-tertiary">· {k.artist}</span>
                  </span>
                  <span className="ml-3 shrink-0 font-medium text-accent">{k.downloads}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-graphite-border bg-graphite p-5">
          <h2 className="mb-3 font-display text-base font-semibold text-ink">Colecciones más descargadas</h2>
          {data.topCollections.length === 0 ? (
            <p className="text-sm text-ink-secondary">Todavía no hay descargas registradas.</p>
          ) : (
            <ul className="space-y-2">
              {data.topCollections.map((c) => (
                <li key={c.id} className="flex items-center justify-between text-sm">
                  <span className="text-ink">{c.title}</span>
                  <span className="font-medium text-accent">{c.downloads}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
