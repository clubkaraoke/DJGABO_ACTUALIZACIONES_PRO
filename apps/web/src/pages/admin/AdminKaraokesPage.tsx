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
  genre: string | null;
  year: number | null;
  format: string | null;
  size: number | null;
  coverUrl: string | null;
  collectionTitle: string;
  collectionId: string;
  collectionSlug: string | null;
  collectionStoragePath: string | null;
  storageStatus: "DISPONIBLE" | "FALTANTE";
  previewStatus: "DISPONIBLE" | "FALTANTE";
  masterAsset: {
    provider: string;
    storageKey: string;
    fileName: string;
    mimeType: string;
    size: number;
    providerFileIdPresent: boolean;
    sourceGroup: string | null;
  } | null;
}
interface KaraokeSearchResponse {
  total: number;
  items: AdminKaraokeRow[];
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = units[0]!;
  for (let i = 1; i < units.length && value >= 1024; i += 1) {
    value /= 1024;
    unit = units[i]!;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${unit}`;
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
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Karaokes</h1>
          <p className="mt-1 text-xs text-ink-tertiary">Auditoría de catálogo: proveedor, marca, formato, portada e identidad del asset.</p>
        </div>
        <SearchBar value={q} onChange={setQ} placeholder="Buscar título, artista o código..." />
      </div>

      {isLoading && <Skeleton className="h-64 w-full" />}

      {data && (
        <>
          <p className="text-sm text-ink-secondary">{data.total} karaokes en total</p>
          <div className="overflow-x-auto rounded-lg border border-graphite-border">
            <table className="w-full min-w-[1240px]">
              <thead>
                <tr className="border-b border-graphite-border bg-graphite text-left text-xs uppercase tracking-wide text-ink-tertiary">
                  <th className="px-4 py-3 font-medium">Título / ruta</th>
                  <th className="px-4 py-3 font-medium">Artista</th>
                  <th className="px-4 py-3 font-medium">Colección</th>
                  <th className="px-4 py-3 font-medium">Origen</th>
                  <th className="px-4 py-3 font-medium">Provider</th>
                  <th className="px-4 py-3 font-medium">Formato</th>
                  <th className="px-4 py-3 font-medium">Tamaño</th>
                  <th className="px-4 py-3 font-medium">Cover</th>
                  <th className="px-4 py-3 font-medium">Storage</th>
                  <th className="px-4 py-3 font-medium">Preview</th>
                  <th className="px-4 py-3 font-medium">ID provider</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((k) => (
                  <tr key={k.id} className="border-b border-graphite-border last:border-0 hover:bg-graphite-elevated/50">
                    <td className="max-w-[360px] px-4 py-3 align-top">
                      <div className="text-sm font-medium text-ink">{k.title}</div>
                      <div className="mt-1 break-all text-[11px] leading-4 text-ink-tertiary">{k.masterAsset?.storageKey ?? "Sin master asset"}</div>
                      <div className="mt-1 text-[10px] uppercase tracking-wide text-ink-tertiary">{k.code}</div>
                    </td>
                    <td className="px-4 py-3 align-top text-sm text-ink-secondary">{k.artist}</td>
                    <td className="px-4 py-3 align-top text-sm text-ink-secondary">{k.collectionTitle}</td>
                    <td className="px-4 py-3 align-top text-sm text-ink-secondary">{k.masterAsset?.sourceGroup ?? "—"}</td>
                    <td className="px-4 py-3 align-top">
                      <Badge tone={k.masterAsset?.provider === "dropbox" ? "accent" : "warning"}>{k.masterAsset?.provider ?? "—"}</Badge>
                    </td>
                    <td className="px-4 py-3 align-top text-sm text-ink-secondary">{k.format ?? "—"}</td>
                    <td className="px-4 py-3 align-top text-sm text-ink-secondary">{formatBytes(k.size)}</td>
                    <td className="px-4 py-3 align-top">
                      <Badge tone={k.coverUrl ? "accent" : "warning"}>{k.coverUrl ? "LISTO" : "FALTANTE"}</Badge>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <Badge tone={k.storageStatus === "DISPONIBLE" ? "accent" : "danger"}>{k.storageStatus}</Badge>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <Badge tone={k.previewStatus === "DISPONIBLE" ? "accent" : "warning"}>{k.previewStatus}</Badge>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <Badge tone={k.masterAsset?.providerFileIdPresent ? "accent" : "warning"}>{k.masterAsset?.providerFileIdPresent ? "PRESENTE" : "FALTANTE"}</Badge>
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
