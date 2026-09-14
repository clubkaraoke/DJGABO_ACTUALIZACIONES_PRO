import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/apiClient";
import { Skeleton } from "../../components/primitives";

interface DownloadLogRow {
  id: string;
  userName: string;
  karaokeId: string | null;
  collectionId: string | null;
  type: string;
  createdAt: string;
}
interface DownloadsResponse {
  total: number;
  items: DownloadLogRow[];
}

export default function AdminDownloadsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "downloads"],
    queryFn: () => api.get<DownloadsResponse>("/admin/downloads"),
  });

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold text-ink">Descargas</h1>

      {isLoading && <Skeleton className="h-64 w-full" />}

      {data && (
        <>
          <p className="text-sm text-ink-secondary">{data.total} registros en total</p>
          <div className="overflow-x-auto rounded-lg border border-graphite-border">
            <table className="w-full min-w-[560px]">
              <thead>
                <tr className="border-b border-graphite-border bg-graphite text-left text-xs uppercase tracking-wide text-ink-tertiary">
                  <th className="px-4 py-3 font-medium">Usuario</th>
                  <th className="px-4 py-3 font-medium">Tipo</th>
                  <th className="px-4 py-3 font-medium">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((l) => (
                  <tr key={l.id} className="border-b border-graphite-border last:border-0">
                    <td className="px-4 py-3 text-sm text-ink">{l.userName}</td>
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
