import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/apiClient";
import { SearchBar } from "../../components/SearchBar";
import { Badge, Skeleton } from "../../components/primitives";

interface AdminKaraokeRow {
  id: string;
  title: string;
  artist: string;
  code: string;
  collectionTitle: string;
  storageStatus: "DISPONIBLE" | "FALTANTE";
  previewStatus: "DISPONIBLE" | "FALTANTE";
}
interface KaraokeSearchResponse {
  total: number;
  items: AdminKaraokeRow[];
}

export default function AdminKaraokesPage() {
  const [q, setQ] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "karaokes", q],
    queryFn: () => api.get<KaraokeSearchResponse>(`/admin/karaokes?q=${encodeURIComponent(q)}`),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-ink">Karaokes</h1>
        <SearchBar value={q} onChange={setQ} placeholder="Buscar título, artista o código..." />
      </div>

      {isLoading && <Skeleton className="h-64 w-full" />}

      {data && (
        <>
          <p className="text-sm text-ink-secondary">{data.total} karaokes en total</p>
          <div className="overflow-x-auto rounded-lg border border-graphite-border">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr className="border-b border-graphite-border bg-graphite text-left text-xs uppercase tracking-wide text-ink-tertiary">
                  <th className="px-4 py-3 font-medium">Título</th>
                  <th className="px-4 py-3 font-medium">Artista</th>
                  <th className="px-4 py-3 font-medium">Código</th>
                  <th className="px-4 py-3 font-medium">Colección</th>
                  <th className="px-4 py-3 font-medium">Storage</th>
                  <th className="px-4 py-3 font-medium">Preview</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((k) => (
                  <tr key={k.id} className="border-b border-graphite-border last:border-0 hover:bg-graphite-elevated/50">
                    <td className="px-4 py-3 text-sm font-medium text-ink">{k.title}</td>
                    <td className="px-4 py-3 text-sm text-ink-secondary">{k.artist}</td>
                    <td className="px-4 py-3 text-xs uppercase text-ink-tertiary">{k.code}</td>
                    <td className="px-4 py-3 text-sm text-ink-secondary">{k.collectionTitle}</td>
                    <td className="px-4 py-3">
                      <Badge tone={k.storageStatus === "DISPONIBLE" ? "accent" : "danger"}>{k.storageStatus}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={k.previewStatus === "DISPONIBLE" ? "accent" : "warning"}>{k.previewStatus}</Badge>
                    </td>
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
