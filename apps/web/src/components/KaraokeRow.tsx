import { Fragment, useState } from "react";
import type { KaraokeSummaryDTO } from "@djgabo/shared";
import { createKaraokeDownloadTicket, openSecureDownload } from "../lib/secureDownloads";
import { ApiError } from "../lib/apiClient";
import { useAuth } from "../lib/authContext";
import { CdgDemoModal } from "./CdgDemoModal";
import { VipAccessModal } from "./VipAccessModal";
import { publicKaraokeDisplay } from "../lib/publicCatalogPresentation";

function formatSize(bytes: number | null): string {
  if (!bytes) return "—";
  return `${(bytes / 1_000_000).toFixed(0)} MB`;
}

export function KaraokeRow({
  karaoke, demoAllowed = false, allowIndividualDownloads = false,
  canDownloadCollection = false, onDownloadCollection,
}: {
  karaoke: KaraokeSummaryDTO;
  demoAllowed?: boolean;
  allowIndividualDownloads?: boolean;
  canDownloadCollection?: boolean;
  onDownloadCollection?: () => void;
}) {
  const { user } = useAuth();
  const display = publicKaraokeDisplay(karaoke);
  const [showPreview, setShowPreview] = useState(false);
  const [showVip, setShowVip] = useState(false);
  const [vipMessage, setVipMessage] = useState<string | undefined>();
  const [downloadState, setDownloadState] = useState<"idle" | "loading" | "error">("idle");
  const isAdminDownload = user?.role === "ADMIN" && allowIndividualDownloads;
  const isVip = Boolean(user && (user.role === "ADMIN" || user.plan));
  const folderMessage = canDownloadCollection
    ? "Las descargas VIP se realizan por carpeta completa, no por karaoke individual. Puedes descargar esta actualización respetando los límites de tu plan."
    : "Puedes escuchar los demos, pero esta carpeta no está habilitada para descarga con tu plan actual. Consulta los planes disponibles.";

  async function handleDownload() {
    // Visible commercial action only for visitors/VIPs. Never request an
    // individual ticket unless the admin-specific download is enabled.
    if (!isAdminDownload) {
      setVipMessage(isVip ? folderMessage : undefined);
      setShowVip(true);
      return;
    }
    setDownloadState("loading");
    try {
      const ticket = await createKaraokeDownloadTicket(karaoke.id);
      openSecureDownload(ticket.downloadPath);
      setDownloadState("idle");
    } catch (error) {
      if (error instanceof ApiError && (error.statusCode === 401 || error.statusCode === 403)) {
        setVipMessage(error.message);
        setShowVip(true);
        setDownloadState("idle");
        return;
      }
      setDownloadState("error");
      setTimeout(() => setDownloadState("idle"), 2500);
    }
  }

  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      {demoAllowed && karaoke.demoAvailable && (
        <button
          onClick={() => setShowPreview(true)}
          className="rounded-md border border-white/[0.10] px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
        >
          ▶ Play
        </button>
      )}
      <button
        disabled={isAdminDownload && (!karaoke.hasMaster || downloadState === "loading")}
        onClick={handleDownload}
        className="rounded-md bg-primary/10 px-2.5 py-1.5 text-[11px] font-semibold text-primary hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-30"
      >
        {downloadState === "loading" ? "…" : downloadState === "error" ? "Error" : "↓ Descargar"}
      </button>
    </div>
  );

  const cover = (
    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-[5px] bg-secondary">
      {karaoke.coverUrl ? (
        <img src={karaoke.coverUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/15 to-white/[0.04] text-[11px] font-semibold text-primary">
          DJ
        </div>
      )}
    </div>
  );

  return (
    <Fragment>
      <tr className="hidden border-b border-white/[0.05] hover:bg-white/[0.025] md:table-row">
        <td className="px-4 py-2.5">{cover}</td>
        <td className="max-w-[440px] px-4 py-2.5">
          <p className="truncate text-[13px] font-semibold text-foreground" title={display.title}>
            {display.title}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={display.artist}>
            {display.artist}
          </p>
        </td>
        <td className="px-4 py-2.5 font-mono text-[11px] uppercase text-muted-foreground">{karaoke.code}</td>
        <td className="px-4 py-2.5 text-[12px] text-muted-foreground">{karaoke.format || "—"}</td>
        <td className="px-4 py-2.5 text-[12px] text-muted-foreground">{formatSize(karaoke.size)}</td>
        <td className="px-4 py-2.5">{actions}</td>
      </tr>

      <tr className="border-b border-white/[0.06] md:hidden">
        <td colSpan={6} className="px-3 py-3">
          <div className="flex items-start gap-3">
            {cover}
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-[13px] font-semibold leading-5 text-foreground" title={display.title}>
                {display.title}
              </p>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={display.artist}>
                {display.artist}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] text-muted-foreground">
                <span>{karaoke.code}</span>
                <span>·</span>
                <span>{karaoke.format || "—"}</span>
                <span>·</span>
                <span>{formatSize(karaoke.size)}</span>
              </div>
              <div className="mt-2.5">{actions}</div>
            </div>
          </div>
        </td>
      </tr>

      {(showPreview || showVip) && (
        <tr className="border-0">
          <td colSpan={6} className="p-0">
            {showPreview && (
              <CdgDemoModal
                karaokeId={karaoke.id}
                title={display.label}
                onClose={() => setShowPreview(false)}
              />
            )}
            {showVip && (
              <VipAccessModal
                loggedIn={Boolean(user)}
                message={vipMessage}
                onDownloadCollection={isVip && canDownloadCollection ? onDownloadCollection : undefined}
                onClose={() => setShowVip(false)}
              />
            )}
          </td>
        </tr>
      )}
    </Fragment>
  );
}
