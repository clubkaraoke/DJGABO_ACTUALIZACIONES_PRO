import { useEffect, useRef, useState } from "react";
import type { ArchiveStatusDTO, BatchStrategy } from "@djgabo/shared";
import { api } from "../lib/apiClient";
import { withDeviceToken } from "../lib/deviceToken";
import { runRealBatchDownload, runDemoBatchDownload, type BatchDownloadHandle, type BatchProgress } from "../lib/batchDownloader";
import { Button, ProgressBar, Spinner } from "./primitives";

interface BatchDownloadResponse {
  strategy: "MULTI_FILE" | "PREBUILT_ARCHIVE";
  totalFiles: number;
  totalSize: number;
  files?: { title: string; artist: string; url: string; size: number; fileName: string; mimeType: string }[];
  url?: string;
  fileName?: string;
  mimeType?: string;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

export function BatchDownloadModal({
  collectionId,
  title,
  onClose,
}: {
  collectionId: string;
  title: string;
  onClose: () => void;
}) {
  const [state, setState] = useState<"loading" | "downloading" | "done" | "error">("loading");
  const [plan, setPlan] = useState<BatchDownloadResponse | null>(null);
  const [archiveStatus, setArchiveStatus] = useState<ArchiveStatusDTO | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const handleRef = useRef<BatchDownloadHandle | null>(null);

  async function startDownload(strategy: BatchStrategy) {
    setState("loading");
    setErrorMsg("");
    try {
      const res = await withDeviceToken((deviceToken) =>
        api.post<BatchDownloadResponse>(`/downloads/collection/${collectionId}`, { strategy }, { "X-Device-Token": deviceToken }),
      );
      setPlan(res);

      const files =
        res.files ??
        (res.url
          ? [
              {
                title,
                artist: "Colección completa",
                url: res.url,
                size: res.totalSize,
                fileName: res.fileName ?? `${title}.zip`,
                mimeType: res.mimeType ?? "application/zip",
              },
            ]
          : []);
      const demo = files.length === 0 || files.some((f) => !f.url.startsWith("http"));
      setIsDemo(demo);

      const callbacks = {
        onProgress: setProgress,
        onDone: () => setState("done"),
        onError: (message: string) => {
          setErrorMsg(message);
          setState("error");
        },
      };

      setState("downloading");
      handleRef.current = demo
        ? runDemoBatchDownload(res.totalFiles, res.totalSize, callbacks)
        : runRealBatchDownload(files, res.totalSize, callbacks);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "No se pudo iniciar la descarga");
      setState("error");
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await api.get<ArchiveStatusDTO>(`/collections/${collectionId}/archive-status`);
        if (!cancelled) setArchiveStatus(status);
      } catch {
        if (!cancelled) setArchiveStatus({ available: false });
      }
      if (!cancelled) await startDownload("MULTI_FILE");
    })();
    return () => {
      cancelled = true;
      handleRef.current?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionId]);

  function handleCancel() {
    handleRef.current?.cancel();
    onClose();
  }

  const percent = plan ? ((progress?.bytesDone ?? 0) / plan.totalSize) * 100 : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-lg border border-graphite-border bg-graphite p-6 shadow-card">
        {state === "loading" && (
          <div className="flex flex-col items-center gap-3 py-6 text-ink-secondary">
            <Spinner className="h-6 w-6 text-accent" />
            <p className="text-sm">Preparando descarga de {title}...</p>
          </div>
        )}

        {state === "error" && (
          <div className="space-y-4">
            <p className="font-display text-lg font-semibold text-ink">No se pudo descargar</p>
            <p className="text-sm text-danger">{errorMsg}</p>
            <Button variant="secondary" className="w-full" onClick={onClose}>
              Cerrar
            </Button>
          </div>
        )}

        {(state === "downloading" || state === "done") && plan && (
          <div className="space-y-4">
            <div>
              <p className="font-display text-lg font-semibold text-ink">
                {state === "done" ? "Descarga completa" : "Descargando"} {title}
              </p>
              <p className="text-sm text-ink-secondary">{Math.round(percent)}%</p>
            </div>
            <ProgressBar value={percent} />
            <div className="flex justify-between text-sm text-ink-secondary">
              <span>
                {progress?.filesDone ?? 0} / {plan.totalFiles} archivos
              </span>
              <span>
                {formatBytes(progress?.bytesDone ?? 0)} / {formatBytes(plan.totalSize)}
              </span>
            </div>
            {state === "downloading" && progress && (
              <p className="text-xs text-ink-tertiary">
                {formatBytes(progress.speedBps)}/s {isDemo && "· modo demo (MockStorageProvider)"}
              </p>
            )}

            {archiveStatus?.available && plan.strategy === "MULTI_FILE" && state === "downloading" && (
              <button
                onClick={() => {
                  handleRef.current?.cancel();
                  void startDownload("PREBUILT_ARCHIVE");
                }}
                className="text-xs text-accent hover:underline"
              >
                Esta colección tiene un ZIP único disponible{archiveStatus.size ? ` (${formatBytes(archiveStatus.size)})` : ""} — usarlo en vez de archivos individuales
              </button>
            )}

            <div className="flex gap-3 pt-2">
              {state === "downloading" ? (
                <Button variant="secondary" className="flex-1" onClick={handleCancel}>
                  Cancelar
                </Button>
              ) : (
                <Button variant="primary" className="flex-1" onClick={onClose}>
                  Listo
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
