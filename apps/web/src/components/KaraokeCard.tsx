import { useState } from "react";
import type { KaraokeSummaryDTO } from "@djgabo/shared";
import { ApiError } from "../lib/apiClient";
import { createKaraokeDownloadTicket, openSecureDownload } from "../lib/secureDownloads";
import { PreviewModal } from "./PreviewModal";
import { publicKaraokeDisplay } from "../lib/publicCatalogPresentation";

export function KaraokeCard({ karaoke }: { karaoke: KaraokeSummaryDTO }) {
  const display = publicKaraokeDisplay(karaoke);
  const [showPreview, setShowPreview] = useState(false);
  const [downloadState, setDownloadState] = useState<"idle" | "loading" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleDownload() {
    setDownloadState("loading");
    setErrorMsg("");
    try {
      const ticket = await createKaraokeDownloadTicket(karaoke.id);
      openSecureDownload(ticket.downloadPath);
      setDownloadState("idle");
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
        <p className="truncate text-sm font-semibold text-ink" title={display.label}>
          {display.label}
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
            {downloadState === "loading" ? "..." : downloadState === "error" ? "Error" : "↓ Descargar"}
          </button>
        </div>
        {downloadState === "error" && <p className="text-[11px] text-danger">{errorMsg}</p>}
      </div>

      {showPreview && (
        <PreviewModal karaokeId={karaoke.id} title={display.title} artist={display.artist} onClose={() => setShowPreview(false)} />
      )}
    </div>
  );
}
