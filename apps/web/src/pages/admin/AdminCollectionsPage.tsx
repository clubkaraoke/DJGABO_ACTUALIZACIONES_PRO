import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/apiClient";
import { Badge, Skeleton } from "../../components/primitives";

interface AdminCollection {
  id: string;
  slug: string;
  title: string;
  year: number;
  month: number;
  active: boolean;
  storagePath: string;
  karaokeCount: number;
  updatedAt: string;
  archiveAvailable: boolean;
  archiveSize: number | null;
}

export default function AdminCollectionsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "collections"],
    queryFn: () => api.get<AdminCollection[]>("/admin/collections"),
  });

  const toggleActive = useMutation({
    mutationFn: (vars: { id: string; active: boolean }) => api.patch(`/admin/collections/${vars.id}`, { active: vars.active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "collections"] }),
  });

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold text-ink">Colecciones</h1>

      {isLoading && <Skeleton className="h-64 w-full" />}

      {data && (
        <div className="overflow-x-auto rounded-lg border border-graphite-border">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="border-b border-graphite-border bg-graphite text-left text-xs uppercase tracking-wide text-ink-tertiary">
                <th className="px-4 py-3 font-medium">Colección</th>
                <th className="px-4 py-3 font-medium">Karaokes</th>
                <th className="px-4 py-3 font-medium">Storage path</th>
                <th className="px-4 py-3 font-medium">ZIP mensual</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id} className="border-b border-graphite-border last:border-0 hover:bg-graphite-elevated/50">
                  <td className="px-4 py-3 text-sm font-medium text-ink">{c.title}</td>
                  <td className="px-4 py-3 text-sm text-ink-secondary">{c.karaokeCount}</td>
                  <td className="px-4 py-3 text-xs text-ink-tertiary">{c.storagePath}</td>
                  <td className="px-4 py-3">
                    <Badge tone={c.archiveAvailable ? "accent" : "neutral"}>
                      {c.archiveAvailable ? `ZIP disponible${c.archiveSize ? ` (${(c.archiveSize / 1_000_000_000).toFixed(1)} GB)` : ""}` : "Sin ZIP — solo individual"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={c.active ? "accent" : "neutral"}>{c.active ? "Activa" : "Inactiva"}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => toggleActive.mutate({ id: c.id, active: !c.active })}
                      className="text-xs font-medium text-accent hover:underline"
                    >
                      {c.active ? "Desactivar" : "Activar"}
                    </button>
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
