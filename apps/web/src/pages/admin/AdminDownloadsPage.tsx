import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/apiClient";
import { Skeleton } from "../../components/primitives";

interface DownloadLogRow {
  id: string;
  userName: string;
  karaokeId: string | null;
  karaokeTitle: string | null;
  karaokeArtist: string | null;
  karaokeCode: string | null;
  collectionId: string | null;
  collectionTitle: string | null;
  type: string;
  createdAt: string;
}
interface DownloadsResponse {
  total: number;
  items: DownloadLogRow[];
}

export default function AdminDownloadsPage() {
  const qc = useQueryClient();
  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ["download-settings"],
    queryFn: () => api.get<{ individualKaraokeDownloadsEnabled: boolean }>("/downloads/settings"),
  });
  const updateSettings = useMutation({
    mutationFn: (enabled: boolean) => api.patch<{ individualKaraokeDownloadsEnabled: boolean }>(
      "/admin/download-settings", { individualKaraokeDownloadsEnabled: enabled },
    ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["download-settings"] }),
  });
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "downloads"],
    queryFn: () => api.get<DownloadsResponse>("/admin/downloads"),
  });

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold text-ink">Descargas</h1>
      <section className="flex flex-col gap-3 rounded-lg border border-graphite-border bg-graphite p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-ink">Descargas individuales VIP</h2>
          <p className="mt-1 text-xs text-ink-secondary">
            {settings?.individualKaraokeDownloadsEnabled
              ? "Permitidas. Los VIP también pueden descargar cada karaoke por separado."
              : "Desactivadas. Los VIP descargan las carpetas completas del mes."}
          </p>
          <p className="mt-1 text-xs text-ink-tertiary">Las descargas mensuales completas no cambian. Los administradores conservan acceso individual.</p>
          {updateSettings.isError && <p role="alert" className="mt-2 text-xs text-red-400">No se pudo guardar el cambio. Intenta nuevamente.</p>}
        </div>
        <button
          type="button"
          disabled={settingsLoading || !settings || updateSettings.isPending}
          onClick={() => updateSettings.mutate(!settings!.individualKaraokeDownloadsEnabled)}
          className="shrink-0 rounded-md border border-graphite-border bg-graphite-elevated px-4 py-2 text-xs font-semibold text-ink disabled:opacity-50"
        >
          {settingsLoading ? "Cargando…" : updateSettings.isPending ? "Guardando…" : settings?.individualKaraokeDownloadsEnabled ? "Desactivar individuales" : "Activar individuales"}
        </button>
      </section>

      {isLoading && <Skeleton className="h-64 w-full" />}

      {data && (
        <>
          <p className="text-sm text-ink-secondary">{data.total} registros en total</p>
          <div className="overflow-x-auto rounded-lg border border-graphite-border">
            <table className="w-full min-w-[980px]">
              <thead>
                <tr className="border-b border-graphite-border bg-graphite text-left text-xs uppercase tracking-wide text-ink-tertiary">
                  <th className="px-4 py-3 font-medium">Usuario</th>
                  <th className="px-4 py-3 font-medium">Karaoke</th>
                  <th className="px-4 py-3 font-medium">Código</th>
                  <th className="px-4 py-3 font-medium">Colección</th>
                  <th className="px-4 py-3 font-medium">Tipo</th>
                  <th className="px-4 py-3 font-medium">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((l) => (
                  <tr key={l.id} className="border-b border-graphite-border last:border-0">
                    <td className="px-4 py-3 text-sm text-ink">{l.userName}</td>
                    <td className="px-4 py-3 text-sm text-ink">
                      <div className="font-medium">{l.karaokeTitle ?? "—"}</div>
                      {l.karaokeArtist && <div className="mt-0.5 text-xs text-ink-tertiary">{l.karaokeArtist}</div>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-ink-secondary">{l.karaokeCode ?? "—"}</td>
                    <td className="px-4 py-3 text-sm text-ink-secondary">{l.collectionTitle ?? "—"}</td>
                    <td className="px-4 py-3 text-sm text-ink-secondary">{l.type}</td>
                    <td className="px-4 py-3 text-sm text-ink-secondary">{new Date(l.createdAt).toLocaleString("es-PE")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
