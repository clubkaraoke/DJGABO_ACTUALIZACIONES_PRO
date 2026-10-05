import { useState } from "react";
import type { KaraokeSummaryDTO } from "@djgabo/shared";
import { createKaraokeDownloadTicket, openSecureDownload } from "../lib/secureDownloads";
import { CdgDemoModal } from "./CdgDemoModal";
import { publicKaraokeDisplay } from "../lib/publicCatalogPresentation";

function formatSize(bytes: number | null): string {
  if (!bytes) return "—";
  return `${(bytes / 1_000_000).toFixed(0)} MB`;
}

export function KaraokeRow({ karaoke, demoAllowed = false }: { karaoke: KaraokeSummaryDTO; demoAllowed?: boolean }) {
  const display = publicKaraokeDisplay(karaoke);
  const [showPreview, setShowPreview] = useState(false);
  const [downloadState, setDownloadState] = useState<"idle" | "loading" | "error">("idle");

  async function handleDownload() {
    setDownloadState("loading");
    try {
      const ticket = await createKaraokeDownloadTicket(karaoke.id);
      openSecureDownload(ticket.downloadPath);
      setDownloadState("idle");
    } catch {
      setDownloadState("error");
      setTimeout(() => setDownloadState("idle"), 2500);
    }
  }

  return (
    <tr className="border-b border-white/[0.05] last:border-0 hover:bg-white/[0.025]">
      <td className="px-4 py-2.5">
        <div className="h-9 w-9 overflow-hidden rounded-[4px] bg-secondary">
          {karaoke.coverUrl ? (
            <img
              src={karaoke.coverUrl}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/15 to-white/[0.04] text-[11px] font-semibold text-primary">
              DJ
            </div>
          )}
        </div>
      </td>

      <td className="max-w-[420px] px-4 py-2.5">
        <p className="truncate text-[13px] font-semibold text-foreground" title={display.label}>
          {display.label}
        </p>
      </td>

      <td className="px-4 py-2.5 font-mono text-[11px] uppercase text-muted-foreground">
        {karaoke.code}
      </td>

      <td className="px-4 py-2.5 text-[12px] text-muted-foreground">
        {karaoke.format || "—"}
      </td>

      <td className="px-4 py-2.5 text-[12px] text-muted-foreground">
        {formatSize(karaoke.size)}
      </td>

      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2">
          {demoAllowed && (
            <button
              onClick={() => setShowPreview(true)}
              className="rounded-md border border-white/[0.10] px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
            >
              ▶ Play
            </button>
          )}
          <button
            disabled={!karaoke.hasMaster || downloadState === "loading"}
            onClick={handleDownload}
            className="rounded-md bg-primary/10 px-2.5 py-1.5 text-[11px] font-semibold text-primary hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-30"
          >
            {downloadState === "loading" ? "…" : downloadState === "error" ? "Error" : "↓ Descargar"}
          </button>
        </div>
      </td>

      {showPreview && (
        <CdgDemoModal
          karaokeId={karaoke.id}
          title={display.label}
          onClose={() => setShowPreview(false)}
        />
      )}
    </tr>
  );
}
