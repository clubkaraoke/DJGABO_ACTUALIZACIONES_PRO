import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SyncStatusDTO } from "@djgabo/shared";
import { api } from "../../lib/apiClient";
import { Badge, Button, Skeleton } from "../../components/primitives";

interface SyncResult {
  dryRun: boolean;
  filesDetected: number;
  newCount: number;
  updatedCount: number;
  errorCount: number;
  items: { storageKey: string; action: string; title: string; artist: string; error?: string }[];
}

interface CoverStatus {
  running: boolean;
  total: number;
  withCover: number;
  matchedFromCache: number;
  noMatch: number;
  errors: number;
  pending: number;
  complete: boolean;
  startedAt: string | null;
  completedAt: string | null;
  lastError: string | null;
}

export default function AdminSyncPage() {
  const qc = useQueryClient();
  const [result, setResult] = useState<SyncResult | null>(null);

  const { data: status, isLoading } = useQuery({
    queryKey: ["admin", "sync", "status"],
    queryFn: () => api.get<SyncStatusDTO>("/admin/sync/status"),
  });

  const { data: coverStatus, isLoading: coversLoading } = useQuery({
    queryKey: ["admin", "covers", "status"],
    queryFn: () => api.get<CoverStatus>("/admin/covers/status"),
    refetchInterval: 5000,
  });

  const analyze = useMutation({
    mutationFn: () => api.post<SyncResult>("/admin/sync/analyze"),
    onSuccess: setResult,
  });

  const runSync = useMutation({
    mutationFn: () => api.post<SyncResult>("/admin/sync/run"),
    onSuccess: (r) => {
      setResult(r);
      qc.invalidateQueries({ queryKey: ["admin", "sync", "status"] });
      qc.invalidateQueries({ queryKey: ["admin", "collections"] });
      qc.invalidateQueries({ queryKey: ["admin", "karaokes"] });
      qc.invalidateQueries({ queryKey: ["admin", "covers", "status"] });
    },
  });

  const runCovers = useMutation({
    mutationFn: () => api.post<CoverStatus>("/admin/covers/run"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "covers", "status"] }),
  });

  const retryCovers = useMutation({
    mutationFn: () => api.post<CoverStatus>("/admin/covers/retry-misses"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "covers", "status"] }),
  });

  const busy = analyze.isPending || runSync.isPending;
  const coverBusy = runCovers.isPending || retryCovers.isPending || coverStatus?.running === true;
  const processed = coverStatus ? Math.max(0, coverStatus.total - coverStatus.pending) : 0;
  const progress = coverStatus?.total ? Math.min(100, Math.round((processed / coverStatus.total) * 100)) : 0;

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="font-display text-2xl font-bold text-ink">Sincronización</h1>

      {isLoading || !status ? (
        <Skeleton className="h-32 w-full" />
      ) : (
        <div className="rounded-lg border border-graphite-border bg-graphite p-5">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-ink-secondary">Storage actual:</span>
            <Badge tone={status.provider === "dropbox" ? "accent" : "neutral"}>{status.provider.toUpperCase()}</Badge>
            <span className="text-ink-secondary">
              Última sincronización: {status.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString("es-PE") : "nunca"}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs uppercase text-ink-tertiary">Detectados</p>
              <p className="font-display text-xl font-bold text-ink">{status.filesDetected}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-ink-tertiary">Nuevos</p>
              <p className="font-display text-xl font-bold text-accent">{status.newCount}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-ink-tertiary">Actualizados</p>
              <p className="font-display text-xl font-bold text-ink">{status.updatedCount}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-ink-tertiary">Errores</p>
              <p className="font-display text-xl font-bold text-danger">{status.errorCount}</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="secondary" disabled={busy} onClick={() => analyze.mutate()}>
          {analyze.isPending ? "Analizando..." : "Analizar (dry-run)"}
        </Button>
        <Button variant="primary" disabled={busy} onClick={() => runSync.mutate()}>
          {runSync.isPending ? "Sincronizando..." : "Sincronizar"}
        </Button>
      </div>

      {coversLoading || !coverStatus ? (
        <Skeleton className="h-44 w-full" />
      ) : (
        <div className="rounded-lg border border-graphite-border bg-graphite p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-lg font-bold text-ink">Portadas automáticas</h2>
                <Badge tone={coverStatus.running ? "warning" : coverStatus.complete ? "accent" : "neutral"}>
                  {coverStatus.running ? "PROCESANDO" : coverStatus.complete ? "COMPLETADO" : "PENDIENTES"}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-ink-tertiary">
                Caché persistente · Deezer + iTunes · los NO MATCH no se vuelven a consultar en cada carga
              </p>
            </div>
            <span className="font-mono text-sm text-ink-secondary">{processed} / {coverStatus.total}</span>
          </div>

          <div className="mt-4 h-2 overflow-hidden rounded-full bg-graphite-elevated">
            <div
              className="h-full rounded-full bg-accent transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-1 text-right text-[11px] text-ink-tertiary">{progress}% procesado</p>

          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs uppercase text-ink-tertiary">Con portada</p>
              <p className="font-display text-xl font-bold text-accent">{coverStatus.withCover}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-ink-tertiary">Sin coincidencia</p>
              <p className="font-display text-xl font-bold text-ink">{coverStatus.noMatch}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-ink-tertiary">Pendientes</p>
              <p className="font-display text-xl font-bold text-ink">{coverStatus.pending}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-ink-tertiary">Errores</p>
              <p className="font-display text-xl font-bold text-danger">{coverStatus.errors}</p>
            </div>
          </div>

          {coverStatus.lastError && (
            <p className="mt-3 rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-xs text-danger">
              Último error: {coverStatus.lastError}
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-3">
            <Button variant="primary" disabled={coverBusy} onClick={() => runCovers.mutate()}>
              {coverStatus.running ? "Procesando..." : "Procesar pendientes"}
            </Button>
            <Button variant="secondary" disabled={coverBusy} onClick={() => retryCovers.mutate()}>
              Reintentar sin coincidencia
            </Button>
          </div>
        </div>
      )}

      {result && (
        <div className="rounded-lg border border-graphite-border bg-graphite p-5">
          <div className="mb-3 flex items-center gap-2">
            <Badge tone={result.dryRun ? "warning" : "accent"}>{result.dryRun ? "DRY RUN" : "SINCRONIZADO"}</Badge>
            <p className="text-sm text-ink-secondary">
              {result.filesDetected} detectados · {result.newCount} nuevos · {result.updatedCount} actualizados · {result.errorCount} errores
            </p>
          </div>
          <div className="max-h-80 overflow-y-auto rounded-md border border-graphite-border">
            <table className="w-full">
              <thead>
                <tr className="border-b border-graphite-border bg-graphite-elevated text-left text-xs uppercase tracking-wide text-ink-tertiary">
                  <th className="px-3 py-2 font-medium">Archivo</th>
                  <th className="px-3 py-2 font-medium">Acción</th>
                </tr>
              </thead>
              <tbody>
                {result.items
                  .filter((i) => i.action !== "SKIP")
                  .map((item, i) => (
                    <tr key={i} className="border-b border-graphite-border last:border-0">
                      <td className="px-3 py-2 text-sm text-ink">
                        {item.artist} - {item.title}
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone={item.action === "ERROR" ? "danger" : item.action === "CREATE" ? "accent" : "neutral"}>
                          {item.action}
                        </Badge>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
