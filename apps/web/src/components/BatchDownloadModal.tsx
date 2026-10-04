import { useEffect, useState } from "react";
import { ApiError } from "../lib/apiClient";
import {
  createCollectionDownloadTicket,
  getCollectionDownloadStatus,
  openSecureDownload,
  type CollectionDownloadStatus,
} from "../lib/secureDownloads";
import { Button, Spinner } from "./primitives";

function denialMessage(code: string | null): string {
  const messages: Record<string, string> = {
    COLLECTION_DAILY_LIMIT_REACHED:
      "Ya utilizaste las descargas disponibles hoy para esta carpeta. Podrás descargarla nuevamente mañana.",
    DAILY_DISTINCT_COLLECTION_LIMIT_REACHED:
      "Ya alcanzaste el máximo de carpetas diferentes que puedes descargar hoy.",
    COLLECTION_SELECTION_LIMIT_REACHED:
      "Ya utilizaste todas las carpetas incluidas en tu plan.",
  };
  return (code && messages[code]) || "Esta carpeta no está disponible para descargar en este momento.";
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
  const [status, setStatus] = useState<CollectionDownloadStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [preparing, setPreparing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingStatus(true);
      setErrorMsg("");
      try {
        const value = await getCollectionDownloadStatus(collectionId);
        if (!cancelled) setStatus(value);
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : "No se pudo verificar la descarga");
        }
      } finally {
        if (!cancelled) setLoadingStatus(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [collectionId]);

  async function handleDownload() {
    if (preparing || status?.canDownload === false) return;
    setPreparing(true);
    setErrorMsg("");
    try {
      const ticket = await createCollectionDownloadTicket(collectionId);
      openSecureDownload(ticket.downloadPath);
      onClose();
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "No se pudo iniciar la descarga",
      );
      setPreparing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-lg border border-graphite-border bg-graphite p-6 shadow-card">
        <h2 className="font-display text-lg font-semibold text-ink">Descargar {title}</h2>
        <p className="mt-2 text-sm leading-6 text-ink-secondary">
          La descarga se genera con un enlace seguro temporal. Dropbox no se mostrará al cliente.
        </p>

        {loadingStatus ? (
          <div className="flex items-center gap-3 py-6 text-sm text-ink-secondary">
            <Spinner className="h-5 w-5 text-accent" />
            Verificando disponibilidad…
          </div>
        ) : (
          <div className="mt-5 rounded-lg border border-graphite-border bg-carbon/50 p-4 text-sm">
            {status && (
              <div className="space-y-1.5 text-ink-secondary">
                <p>
                  Descargas hoy: <strong className="text-ink">{status.downloadsToday}</strong> de{" "}
                  <strong className="text-ink">{status.maxDownloadsPerDay}</strong>
                </p>
                {status.maxSelectedCollections !== null && (
                  <p>
                    Carpetas utilizadas: <strong className="text-ink">{status.selectedCollections}</strong> de{" "}
                    <strong className="text-ink">{status.maxSelectedCollections}</strong>
                  </p>
                )}
                {status.canDownload === false && (
                  <p className="pt-2 text-warning">{denialMessage(status.denialReason)}</p>
                )}
              </div>
            )}
            {errorMsg && <p className="text-danger">{errorMsg}</p>}
          </div>
        )}

        <div className="mt-5 flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={preparing}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            onClick={handleDownload}
            disabled={loadingStatus || preparing || status?.canDownload === false}
          >
            {preparing ? "Preparando…" : "Descargar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
