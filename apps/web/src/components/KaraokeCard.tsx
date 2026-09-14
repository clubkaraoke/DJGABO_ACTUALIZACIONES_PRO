import { useState } from "react";
import type { KaraokeSummaryDTO, TemporaryUrlDTO } from "@djgabo/shared";
import { api, ApiError } from "../lib/apiClient";
import { withDeviceToken } from "../lib/deviceToken";
import { PreviewModal } from "./PreviewModal";

function triggerDownload(url: string, fileName: string) {
  if (url.startsWith("http")) {
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}

export function KaraokeCard({ karaoke }: { karaoke: KaraokeSummaryDTO }) {
  const [showPreview, setShowPreview] = useState(false);
  const [downloadState, setDownloadState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleDownload() {
    setDownloadState("loading");
    try {
      const res = await withDeviceToken((deviceToken) =>
        api.post<TemporaryUrlDTO>(`/downloads/karaoke/${karaoke.id}`, undefined, { "X-Device-Token": deviceToken }),
      );
      // El nombre y la extensión reales vienen del backend (punto 1): nunca
      // se asume .mp4 — un preview/master puede ser .mp3, .wav, etc.
      triggerDownload(res.url, res.fileName);
      setDownloadState("done");
      setTimeout(() => setDownloadState("idle"), 2000);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "No se pudo descargar");
      setDownloadState("error");
      setTimeout(() => setDownloadState("idle"), 2500);
    }
  }

  return (
    <div className="group flex flex-col overflow-hidden rounded-lg border border-graphite-border bg-graphite transition-colors hover:border-accent/40">
      <div className="relative aspect-square w-full overflow-hidden bg-graphite-elevated">
        {karaoke.coverUrl && (
          <img src={karaoke.coverUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="truncate text-sm font-semibold text-ink" title={karaoke.title}>
          {karaoke.title}
        </p>
        <p className="truncate text-xs text-ink-secondary" title={karaoke.artist}>
          {karaoke.artist}
        </p>
        <p className="text-[11px] uppercase tracking-wide text-ink-tertiary">{karaoke.code}</p>

        <div className="mt-auto flex gap-2 pt-2">
          <button
            disabled={!karaoke.hasPreview}
            onClick={() => setShowPreview(true)}
            className="flex-1 rounded-md border border-graphite-border py-1.5 text-xs font-medium text-ink-secondary hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
          >
            ▶ Preview
          </button>
          <button
            disabled={!karaoke.hasMaster || downloadState === "loading"}
            onClick={handleDownload}
            className="flex-1 rounded-md bg-accent-soft py-1.5 text-xs font-medium text-accent hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-30"
          >
            {downloadState === "loading" ? "..." : downloadState === "done" ? "✓ Listo" : downloadState === "error" ? "Error" : "↓ Descargar"}
          </button>
        </div>
        {downloadState === "error" && <p className="text-[11px] text-danger">{errorMsg}</p>}
      </div>

      {showPreview && (
        <PreviewModal karaokeId={karaoke.id} title={karaoke.title} artist={karaoke.artist} onClose={() => setShowPreview(false)} />
      )}
    </div>
  );
}
