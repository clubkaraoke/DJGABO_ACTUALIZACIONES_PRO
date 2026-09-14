import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { AdminClientRowDTO } from "@djgabo/shared";
import { api } from "../../lib/apiClient";
import { Badge, Skeleton } from "../../components/primitives";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
}

const STATUS_TONE: Record<string, "accent" | "danger" | "warning"> = {
  ACTIVE: "accent",
  SUSPENDED: "danger",
  EXPIRED: "warning",
};
const STATUS_LABEL: Record<string, string> = { ACTIVE: "Activo", SUSPENDED: "Suspendido", EXPIRED: "Vencido" };

export default function AdminClientsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "clients"],
    queryFn: () => api.get<AdminClientRowDTO[]>("/admin/clients"),
  });

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold text-ink">Clientes</h1>

      {isLoading && <Skeleton className="h-64 w-full" />}

      {data && (
        <div className="overflow-x-auto rounded-lg border border-graphite-border">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="border-b border-graphite-border bg-graphite text-left text-xs uppercase tracking-wide text-ink-tertiary">
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Vigencia</th>
                <th className="px-4 py-3 font-medium">Dispositivos</th>
                <th className="px-4 py-3 font-medium">Colecciones</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id} className="border-b border-graphite-border last:border-0 hover:bg-graphite-elevated/50">
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-ink">{c.name}</p>
                    <p className="text-xs text-ink-tertiary">{c.email}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-ink-secondary">{c.plan ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Badge tone={STATUS_TONE[c.status] ?? "neutral"}>{STATUS_LABEL[c.status] ?? c.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-sm text-ink-secondary">
                    {formatDate(c.subscriptionStart)} → {formatDate(c.subscriptionEnd)}
                  </td>
                  <td className="px-4 py-3 text-sm text-ink-secondary">
                    {c.devicesUsed}/{c.maxDevices}
                  </td>
                  <td className="px-4 py-3 text-sm text-ink-secondary">{c.accessibleCollections}</td>
                  <td className="px-4 py-3 text-right">
                    <Link to={`/admin/clientes/${c.id}`} className="text-xs font-medium text-accent hover:underline">
                      Administrar
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
