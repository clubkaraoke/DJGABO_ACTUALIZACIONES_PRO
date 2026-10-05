import { useQuery } from "@tanstack/react-query";
import type { AdminDashboardStatsDTO } from "@djgabo/shared";
import { Activity, Download, Users } from "lucide-react";
import { api } from "../../lib/apiClient";
import { Skeleton } from "../../components/primitives";

function StatCard({ label, value, icon: Icon }: { label: string; value: number | string; icon: typeof Download }) {
  return (
    <div className="rounded-[12px] border border-white/[0.07] bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-ink-tertiary">{label}</p>
        <Icon className="h-4 w-4 text-primary/70" />
      </div>
      <p className="mt-2 text-3xl font-extrabold tracking-[-0.04em] text-foreground">{value}</p>
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-[12px]" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Resumen general</p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-[-0.03em] text-foreground">Dashboard</h1>
        <p className="mt-1 text-[12px] text-muted-foreground">Actividad reciente de clientes, descargas y colecciones.</p>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Descargas hoy" value={data.downloadsToday} icon={Download} />
        <StatCard label="Descargas esta semana" value={data.downloadsThisWeek} icon={Activity} />
        <StatCard label="Usuarios activos" value={data.activeUsers} icon={Users} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-[12px] border border-white/[0.07] bg-card p-5">
          <div className="mb-4">
            <p className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-ink-tertiary">Rendimiento</p>
            <h2 className="mt-1 text-[15px] font-bold tracking-tight text-foreground">Karaokes más descargados</h2>
          </div>
          {data.topKaraokes.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">Todavía no hay descargas registradas.</p>
          ) : (
            <ul className="space-y-1">
              {data.topKaraokes.map((k, index) => (
                <li key={k.id} className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-white/[0.025]">
                  <span className="w-5 font-mono text-[10px] text-ink-tertiary">{String(index + 1).padStart(2, "0")}</span>
                  <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-foreground">
                    {k.title} <span className="font-normal text-muted-foreground">· {k.artist}</span>
                  </span>
                  <span className="font-mono text-[11px] font-bold text-primary">{k.downloads}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-[12px] border border-white/[0.07] bg-card p-5">
          <div className="mb-4">
            <p className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-ink-tertiary">Rendimiento</p>
            <h2 className="mt-1 text-[15px] font-bold tracking-tight text-foreground">Colecciones más descargadas</h2>
          </div>
          {data.topCollections.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">Todavía no hay descargas registradas.</p>
          ) : (
            <ul className="space-y-1">
              {data.topCollections.map((c, index) => (
                <li key={c.id} className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-white/[0.025]">
                  <span className="w-5 font-mono text-[10px] text-ink-tertiary">{String(index + 1).padStart(2, "0")}</span>
                  <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-foreground">{c.title}</span>
                  <span className="font-mono text-[11px] font-bold text-primary">{c.downloads}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
