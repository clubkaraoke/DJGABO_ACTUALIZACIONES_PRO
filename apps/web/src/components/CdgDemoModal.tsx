import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { api, ApiError } from "../lib/apiClient";

export type DemoPlayerQuality = "ORIGINAL" | "SDF_LAB_V2" | "SDF_KARAOKE_PRO";
export type DemoBackgroundType = "solid" | "gradient" | "image";

export interface DemoVisualPreset {
  id: string;
  name: string;
  backgroundType: DemoBackgroundType;
  backgroundValue: string;
  logoUrl: string | null;
  logoX: number;
  logoY: number;
  logoWidth: number;
  logoOpacity: number;
}

interface CdgDemoConfig {
  karaokeId: string;
  title: string;
  artist: string;
  startSeconds: number;
  sourceStartSeconds: number;
  durationSeconds: number;
  quality: DemoPlayerQuality;
  visualPreset: DemoVisualPreset;
  audioUrl: string;
  cdgUrl: string;
}

const PLAYER_MODE: Record<DemoPlayerQuality, string> = {
  ORIGINAL: "original",
  SDF_LAB_V2: "hd",
  SDF_KARAOKE_PRO: "sdf-pro",
};

export function CdgDemoModal({
  karaokeId,
  title,
  onClose,
}: {
  karaokeId: string;
  title: string;
  onClose: () => void;
}) {
  const [config, setConfig] = useState<CdgDemoConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api.get<CdgDemoConfig>(`/preview/cdg/${karaokeId}/config`)
      .then((value) => {
        if (alive) setConfig(value);
      })
      .catch((err) => {
        if (!alive) return;
        setError(
          err instanceof ApiError
            ? err.message
            : "No se pudo preparar el demo de este karaoke.",
        );
      });
    return () => {
      alive = false;
    };
  }, [karaokeId]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const playerUrl = useMemo(() => {
    if (!config) return "";
    const preset = config.visualPreset;
    const params = new URLSearchParams({
      embed: "1",
      audio: config.audioUrl,
      cdg: config.cdgUrl,
      title,
      start: String(config.startSeconds),
      duration: String(config.durationSeconds),
      cdgStart: String(config.sourceStartSeconds),
      quality: PLAYER_MODE[config.quality],
      autoplay: "1",
      bgType: preset.backgroundType,
      bg: preset.backgroundValue,
      logoX: String(preset.logoX),
      logoY: String(preset.logoY),
      logoWidth: String(preset.logoWidth),
      logoOpacity: String(preset.logoOpacity),
    });
    if (preset.logoUrl) params.set("logo", preset.logoUrl);
    return `/cdg-player/index.html?${params.toString()}`;
  }, [config, title]);

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/80 p-3 backdrop-blur-sm sm:items-center">
      <div className="my-2 w-full max-w-[790px] overflow-hidden rounded-[12px] border border-white/[0.10] bg-[#101012] shadow-2xl sm:my-0">
        <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{title}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Demo Club Karaoke · {config ? `${config.durationSeconds} segundos` : "Preparando…"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-muted-foreground transition hover:bg-white/[0.06] hover:text-foreground"
            aria-label="Cerrar demo"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-2.5">
          {error ? (
            <div className="flex min-h-[330px] items-center justify-center rounded-[9px] border border-white/[0.06] bg-black px-6 text-center text-sm text-muted-foreground">
              {error}
            </div>
          ) : !config ? (
            <div className="flex min-h-[330px] items-center justify-center rounded-[9px] border border-white/[0.06] bg-black text-sm text-muted-foreground">
              Preparando demo…
            </div>
          ) : (
            <iframe
              title={`Demo de ${title}`}
              src={playerUrl}
              allow="autoplay; fullscreen"
              className="block h-[calc((100vw-44px)*0.6667+88px)] max-h-[78dvh] w-full rounded-[9px] border-0 bg-black sm:h-[570px] sm:max-h-[72dvh]"
            />
          )}
        </div>
      </div>
    </div>
  );
}
