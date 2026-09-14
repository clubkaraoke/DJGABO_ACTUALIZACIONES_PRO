import { useEffect, useState } from "react";
import type { TemporaryUrlDTO } from "@djgabo/shared";
import { api } from "../lib/apiClient";
import { Button, Spinner } from "./primitives";

export function PreviewModal({
  karaokeId,
  title,
  artist,
  onClose,
}: {
  karaokeId: string;
  title: string;
  artist: string;
  onClose: () => void;
}) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [preview, setPreview] = useState<TemporaryUrlDTO | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.post<TemporaryUrlDTO>(`/preview/karaoke/${karaokeId}`);
        if (!cancelled) {
          setPreview(res);
          setState("ready");
        }
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : "No se pudo cargar el preview");
          setState("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [karaokeId]);

  const isRealUrl = preview?.url.startsWith("http");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-lg border border-graphite-border bg-graphite p-6 shadow-card">
        <div className="mb-4">
          <p className="font-display text-lg font-semibold text-ink">{title}</p>
          <p className="text-sm text-ink-secondary">{artist}</p>
        </div>

        {state === "loading" && (
          <div className="flex items-center justify-center gap-3 py-10 text-ink-secondary">
            <Spinner className="h-5 w-5 text-accent" />
            <span className="text-sm">Generando preview...</span>
          </div>
        )}

        {state === "error" && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{errorMsg}</p>}

        {state === "ready" && preview && (
          <div className="space-y-3">
            {isRealUrl ? (
              <video controls src={preview.url} className="w-full rounded-md bg-black" />
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-graphite-border bg-graphite-elevated py-10">
                <div className="flex h-10 items-end gap-0.5">
                  {[6, 14, 9, 18, 7, 12, 16, 5].map((h, i) => (
                    <span key={i} className="w-1 rounded-full bg-accent/60" style={{ height: `${h * 2}px` }} />
                  ))}
                </div>
                <p className="text-xs text-ink-tertiary">
                  Preview simulado (MockStorageProvider) — al conectar Dropbox esto reproduce el archivo real.
                </p>
              </div>
            )}
            <p className="text-xs text-ink-tertiary">
              {preview.expiresAt
                ? `Enlace temporal, vence a las ${new Date(preview.expiresAt).toLocaleTimeString("es-PE")}.`
                : "Enlace temporal — el proveedor de almacenamiento no informa una hora de expiración exacta."}
            </p>
          </div>
        )}

        <Button variant="secondary" className="mt-5 w-full" onClick={onClose}>
          Cerrar
        </Button>
      </div>
    </div>
  );
}
