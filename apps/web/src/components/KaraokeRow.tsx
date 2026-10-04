import { useState } from "react";
import type { KaraokeSummaryDTO } from "@djgabo/shared";
import { createKaraokeDownloadTicket, openSecureDownload } from "../lib/secureDownloads";
import { PreviewModal } from "./PreviewModal";

function formatSize(bytes: number | null): string {
  if (!bytes) return "—";
  return `${(bytes / 1_000_000).toFixed(0)} MB`;
}
function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
}

export function KaraokeRow({ karaoke }: { karaoke: KaraokeSummaryDTO }) {
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
    <tr className="border-b border-graphite-border last:border-0 hover:bg-graphite-elevated/50">
      <td className="max-w-[220px] truncate px-4 py-3 text-sm font-medium text-ink" title={karaoke.title}>
        {karaoke.title}
      </td>
      <td className="max-w-[160px] truncate px-4 py-3 text-sm text-ink-secondary" title={karaoke.artist}>
        {karaoke.artist}
      </td>
      <td className="px-4 py-3 text-xs uppercase text-ink-tertiary">{karaoke.code}</td>
      <td className="px-4 py-3 text-sm text-ink-secondary">{formatDate(karaoke.publishedAt)}</td>
      <td className="px-4 py-3 text-sm text-ink-secondary">{formatSize(karaoke.size)}</td>
      <td className="px-4 py-3">
        <div className="flex gap-2">
          <button
            disabled={!karaoke.hasPreview}
            onClick={() => setShowPreview(true)}
            className="rounded-md border border-graphite-border px-2.5 py-1 text-xs text-ink-secondary hover:text-ink disabled:opacity-30"
          >
            ▶
          </button>
          <button
            disabled={!karaoke.hasMaster || downloadState === "loading"}
            onClick={handleDownload}
            className="rounded-md bg-accent-soft px-2.5 py-1 text-xs text-accent hover:bg-accent/20 disabled:opacity-30"
          >
            {downloadState === "loading" ? "…" : downloadState === "error" ? "!" : "↓"}
          </button>
        </div>
      </td>

      {showPreview && (
        <PreviewModal karaokeId={karaoke.id} title={karaoke.title} artist={karaoke.artist} onClose={() => setShowPreview(false)} />
      )}
    </tr>
  );
}
