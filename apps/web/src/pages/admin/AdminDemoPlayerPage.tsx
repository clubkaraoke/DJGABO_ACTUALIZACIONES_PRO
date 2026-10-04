import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Copy, ImagePlus, Save, Trash2, Upload } from "lucide-react";
import { api, ApiError } from "../../lib/apiClient";
import { Button } from "../../components/primitives";
import {
  CdgDemoModal,
  type DemoBackgroundType,
  type DemoPlayerQuality,
  type DemoVisualPreset,
} from "../../components/CdgDemoModal";

interface DemoPlayerSettings {
  enabled: boolean;
  startSeconds: number;
  durationSeconds: number;
  quality: DemoPlayerQuality;
  activePresetId: string;
  presets: DemoVisualPreset[];
}

interface DemoSample {
  karaokeId: string;
  title: string;
  artist: string;
}

interface UploadResponse {
  url: string;
}

const QUALITY_OPTIONS: Array<{ value: DemoPlayerQuality; label: string; description: string }> = [
  { value: "ORIGINAL", label: "ORIGINAL", description: "CDG nativo, píxel directo." },
  { value: "SDF_LAB_V2", label: "SDF LAB V2", description: "Suavizado SDF del motor estable." },
  { value: "SDF_KARAOKE_PRO", label: "SDF KARAOKE PRO", description: "SDF + tratamiento visual Karaoke PRO." },
];

const VIP_GRADIENT = "linear-gradient(135deg,#0A0A0B 0%,#17171B 55%,#0A0A0B 100%)";
const GRAPHITE_GRADIENT = "linear-gradient(135deg,#111113 0%,#27272A 55%,#111113 100%)";

function presetBackground(preset: DemoVisualPreset): CSSProperties {
  if (preset.backgroundType === "image" && preset.backgroundValue) {
    return {
      backgroundImage: `linear-gradient(rgba(0,0,0,.16),rgba(0,0,0,.16)),url("${preset.backgroundValue}")`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }
  if (preset.backgroundType === "gradient") {
    return { backgroundImage: preset.backgroundValue };
  }
  return { background: preset.backgroundValue || "#0A0A0B" };
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });
}

function newPresetId(): string {
  return `preset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export default function AdminDemoPlayerPage() {
  const [settings, setSettings] = useState<DemoPlayerSettings | null>(null);
  const [state, setState] = useState<"loading" | "idle" | "saving" | "saved" | "error">("loading");
  const [message, setMessage] = useState("");
  const [sample, setSample] = useState<DemoSample | null>(null);
  const [uploading, setUploading] = useState<"background" | "logo" | null>(null);
  const [draggingLogo, setDraggingLogo] = useState(false);
  const stageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    api.get<DemoPlayerSettings>("/admin/demo-player-settings")
      .then((value) => {
        setSettings(value);
        setState("idle");
      })
      .catch(() => {
        setState("error");
        setMessage("No se pudo cargar la configuración del reproductor.");
      });
  }, []);

  const activePreset = useMemo(() => {
    if (!settings) return null;
    return settings.presets.find((preset) => preset.id === settings.activePresetId) ?? settings.presets[0] ?? null;
  }, [settings]);

  function updatePreset(patch: Partial<DemoVisualPreset>) {
    if (!settings || !activePreset) return;
    setSettings({
      ...settings,
      presets: settings.presets.map((preset) =>
        preset.id === activePreset.id ? { ...preset, ...patch } : preset,
      ),
    });
  }

  async function save() {
    if (!settings) return;
    setState("saving");
    setMessage("");
    try {
      const saved = await api.put<DemoPlayerSettings>("/admin/demo-player-settings", settings);
      setSettings(saved);
      setState("saved");
      setMessage("Configuración y preset guardados.");
      setTimeout(() => setState("idle"), 1800);
    } catch (err) {
      setState("error");
      setMessage(err instanceof ApiError ? err.message : "No se pudo guardar.");
    }
  }

  async function uploadAsset(kind: "background" | "logo", file?: File) {
    if (!file || !activePreset) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setMessage("Usa una imagen PNG, JPG o WEBP.");
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      setMessage("La imagen no puede superar 6 MB.");
      return;
    }

    setUploading(kind);
    setMessage("");
    try {
      const dataUrl = await fileToDataUrl(file);
      const result = await api.post<UploadResponse>("/admin/demo-player-assets", { kind, dataUrl });
      if (kind === "background") {
        updatePreset({ backgroundType: "image", backgroundValue: result.url });
      } else {
        updatePreset({ logoUrl: result.url });
      }
      setMessage(kind === "background" ? "Fondo cargado. Guarda el preset para activarlo." : "Logo cargado. Muévelo y guarda el preset.");
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "No se pudo subir la imagen.");
    } finally {
      setUploading(null);
    }
  }

  function createPreset() {
    if (!settings || !activePreset) return;
    const copy: DemoVisualPreset = {
      ...activePreset,
      id: newPresetId(),
      name: `${activePreset.name} copia`,
    };
    setSettings({
      ...settings,
      activePresetId: copy.id,
      presets: [...settings.presets, copy],
    });
  }

  function deletePreset() {
    if (!settings || !activePreset || settings.presets.length <= 1) return;
    const remaining = settings.presets.filter((preset) => preset.id !== activePreset.id);
    setSettings({
      ...settings,
      presets: remaining,
      activePresetId: remaining[0]!.id,
    });
  }

  function positionLogo(clientX: number, clientY: number) {
    if (!stageRef.current || !activePreset) return;
    const rect = stageRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100));
    updatePreset({ logoX: Math.round(x * 10) / 10, logoY: Math.round(y * 10) / 10 });
  }

  async function testPlayer() {
    setMessage("");
    try {
      // Guardamos primero para que la prueba use exactamente el preset visible.
      await save();
      const value = await api.get<DemoSample>("/admin/demo-player-settings/sample");
      setSample(value);
    } catch (err) {
      setMessage(
        err instanceof ApiError
          ? err.message
          : "No se encontró un karaoke de Club Karaoke listo para probar.",
      );
    }
  }

  if (!settings || !activePreset) {
    return (
      <div className="rounded-lg border border-graphite-border bg-graphite p-6 text-sm text-ink-secondary">
        {state === "error" ? message : "Cargando reproductor CDG…"}
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Reproductor CDG / Demos</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          El cliente solo ve Play. Aquí controlas duración, calidad y apariencia del demo de Club Karaoke.
        </p>
      </div>

      <section className="rounded-lg border border-graphite-border bg-graphite p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-semibold text-ink">Demo</h2>
            <p className="mt-1 text-xs text-ink-secondary">
              El backend entrega únicamente el fragmento configurado. Top Hits 01–04 no reproducen demos.
            </p>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-ink">
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
              className="h-4 w-4 accent-yellow-400"
            />
            {settings.enabled ? "ON" : "OFF"}
          </label>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5 text-sm text-ink-secondary">
            <span>Comenzar desde el segundo</span>
            <input
              type="number"
              min={0}
              max={600}
              value={settings.startSeconds}
              onChange={(e) => setSettings({ ...settings, startSeconds: Number(e.target.value) })}
              className="w-full rounded-md border border-graphite-border bg-carbon px-3 py-2 text-ink outline-none focus:border-accent"
            />
          </label>
          <label className="space-y-1.5 text-sm text-ink-secondary">
            <span>Duración del demo</span>
            <div className="relative">
              <input
                type="number"
                min={15}
                max={90}
                value={settings.durationSeconds}
                onChange={(e) => setSettings({ ...settings, durationSeconds: Number(e.target.value) })}
                className="w-full rounded-md border border-graphite-border bg-carbon px-3 py-2 pr-16 text-ink outline-none focus:border-accent"
              />
              <span className="absolute right-3 top-2.5 text-xs text-ink-tertiary">segundos</span>
            </div>
          </label>
        </div>
      </section>

      <section className="rounded-lg border border-graphite-border bg-graphite p-5">
        <h2 className="font-display text-base font-semibold text-ink">Calidad activa</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {QUALITY_OPTIONS.map((option) => {
            const active = settings.quality === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setSettings({ ...settings, quality: option.value })}
                className={`rounded-lg border p-4 text-left transition-colors ${
                  active
                    ? "border-accent bg-accent/10"
                    : "border-graphite-border bg-carbon hover:border-ink-tertiary"
                }`}
              >
                <div className={`text-sm font-bold ${active ? "text-accent" : "text-ink"}`}>{option.label}</div>
                <p className="mt-1 text-xs leading-5 text-ink-secondary">{option.description}</p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-lg border border-graphite-border bg-graphite p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-ink">Diseño y presets</h2>
            <p className="mt-1 text-xs text-ink-secondary">
              Fondo, logo y posición se guardan por preset. Arrastra el logo directamente sobre la vista previa.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={createPreset}>
              <Copy className="mr-1.5 h-3.5 w-3.5" /> Duplicar preset
            </Button>
            <Button variant="secondary" onClick={deletePreset} disabled={settings.presets.length <= 1}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Eliminar
            </Button>
          </div>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
          <div className="space-y-5">
            <label className="block space-y-1.5 text-sm text-ink-secondary">
              <span>Preset activo</span>
              <select
                value={settings.activePresetId}
                onChange={(e) => setSettings({ ...settings, activePresetId: e.target.value })}
                className="w-full rounded-md border border-graphite-border bg-carbon px-3 py-2 text-ink outline-none focus:border-accent"
              >
                {settings.presets.map((preset) => (
                  <option key={preset.id} value={preset.id}>{preset.name}</option>
                ))}
              </select>
            </label>

            <label className="block space-y-1.5 text-sm text-ink-secondary">
              <span>Nombre del preset</span>
              <input
                value={activePreset.name}
                onChange={(e) => updatePreset({ name: e.target.value })}
                maxLength={60}
                className="w-full rounded-md border border-graphite-border bg-carbon px-3 py-2 text-ink outline-none focus:border-accent"
              />
            </label>

            <div>
              <div className="mb-2 text-sm text-ink-secondary">Fondo</div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => updatePreset({ backgroundType: "gradient", backgroundValue: VIP_GRADIENT })}
                  className="rounded-md border border-graphite-border bg-carbon px-2 py-2 text-xs font-semibold text-ink hover:border-accent"
                >
                  VIP
                </button>
                <button
                  type="button"
                  onClick={() => updatePreset({ backgroundType: "solid", backgroundValue: "#050506" })}
                  className="rounded-md border border-graphite-border bg-carbon px-2 py-2 text-xs font-semibold text-ink hover:border-accent"
                >
                  Negro
                </button>
                <button
                  type="button"
                  onClick={() => updatePreset({ backgroundType: "gradient", backgroundValue: GRAPHITE_GRADIENT })}
                  className="rounded-md border border-graphite-border bg-carbon px-2 py-2 text-xs font-semibold text-ink hover:border-accent"
                >
                  Grafito
                </button>
              </div>

              {activePreset.backgroundType === "solid" && (
                <label className="mt-3 flex items-center justify-between rounded-md border border-graphite-border bg-carbon px-3 py-2 text-xs text-ink-secondary">
                  Color personalizado
                  <input
                    type="color"
                    value={activePreset.backgroundValue}
                    onChange={(e) => updatePreset({ backgroundType: "solid", backgroundValue: e.target.value })}
                    className="h-7 w-10 cursor-pointer border-0 bg-transparent"
                  />
                </label>
              )}

              <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-graphite-border bg-carbon px-3 py-3 text-xs font-semibold text-ink transition hover:border-accent">
                <ImagePlus className="h-4 w-4" />
                {uploading === "background" ? "Subiendo fondo…" : "Subir imagen de fondo"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  disabled={uploading !== null}
                  onChange={(e) => void uploadAsset("background", e.target.files?.[0])}
                />
              </label>
            </div>

            <div>
              <div className="mb-2 text-sm text-ink-secondary">Logo</div>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-graphite-border bg-carbon px-3 py-3 text-xs font-semibold text-ink transition hover:border-accent">
                <Upload className="h-4 w-4" />
                {uploading === "logo" ? "Subiendo logo…" : activePreset.logoUrl ? "Cambiar logo" : "Subir logo"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  disabled={uploading !== null}
                  onChange={(e) => void uploadAsset("logo", e.target.files?.[0])}
                />
              </label>
              {activePreset.logoUrl && (
                <button
                  type="button"
                  onClick={() => updatePreset({ logoUrl: null })}
                  className="mt-2 text-xs text-ink-tertiary hover:text-danger"
                >
                  Quitar logo
                </button>
              )}
            </div>

            <label className="block space-y-1.5 text-xs text-ink-secondary">
              <span>Tamaño del logo · {Math.round(activePreset.logoWidth)}%</span>
              <input
                type="range"
                min={4}
                max={45}
                step={1}
                value={activePreset.logoWidth}
                onChange={(e) => updatePreset({ logoWidth: Number(e.target.value) })}
                className="w-full accent-yellow-400"
              />
            </label>

            <label className="block space-y-1.5 text-xs text-ink-secondary">
              <span>Opacidad · {Math.round(activePreset.logoOpacity * 100)}%</span>
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={activePreset.logoOpacity}
                onChange={(e) => updatePreset({ logoOpacity: Number(e.target.value) })}
                className="w-full accent-yellow-400"
              />
            </label>
          </div>

          <div>
            <div
              ref={stageRef}
              className="relative aspect-[3/2] w-full select-none overflow-hidden rounded-[10px] border border-white/[0.10] shadow-inner"
              style={presetBackground(activePreset)}
              onPointerMove={(e) => {
                if (draggingLogo) positionLogo(e.clientX, e.clientY);
              }}
              onPointerUp={() => setDraggingLogo(false)}
              onPointerCancel={() => setDraggingLogo(false)}
            >
              <div className="absolute inset-0 bg-black/5" />
              <div className="absolute inset-x-[8%] top-1/2 -translate-y-1/2 text-center font-black uppercase tracking-wide text-white [text-shadow:0_2px_0_#000,2px_0_0_#000,-2px_0_0_#000,0_-2px_0_#000]">
                <div className="text-[clamp(18px,3.2vw,38px)] text-yellow-300">VISTA PREVIA KARAOKE</div>
                <div className="mt-1 text-[clamp(16px,2.8vw,34px)]">MUEVE TU LOGO AQUÍ</div>
              </div>
              {activePreset.logoUrl && (
                <img
                  src={activePreset.logoUrl}
                  alt="Logo del preset"
                  draggable={false}
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setDraggingLogo(true);
                    positionLogo(e.clientX, e.clientY);
                  }}
                  style={{
                    position: "absolute",
                    left: `${activePreset.logoX}%`,
                    top: `${activePreset.logoY}%`,
                    width: `${activePreset.logoWidth}%`,
                    opacity: activePreset.logoOpacity,
                    transform: "translate(-50%,-50%)",
                    cursor: draggingLogo ? "grabbing" : "grab",
                    touchAction: "none",
                  }}
                />
              )}
            </div>
            <div className="mt-2 flex justify-between text-[11px] text-ink-tertiary">
              <span>Arrastra el logo sobre la vista previa</span>
              <span>X {activePreset.logoX.toFixed(1)} · Y {activePreset.logoY.toFixed(1)}</span>
            </div>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={save} disabled={state === "saving"}>
          <Save className="mr-1.5 h-4 w-4" />
          {state === "saving" ? "Guardando…" : "Guardar configuración"}
        </Button>
        <Button variant="secondary" onClick={testPlayer} disabled={!settings.enabled || state === "saving"}>
          Probar con Club Karaoke
        </Button>
        {message && (
          <span className={`text-xs ${state === "error" ? "text-danger" : "text-ink-secondary"}`}>
            {message}
          </span>
        )}
      </div>

      {sample && (
        <CdgDemoModal
          karaokeId={sample.karaokeId}
          title={`${sample.artist} - ${sample.title}`}
          onClose={() => setSample(null)}
        />
      )}
    </div>
  );
}
