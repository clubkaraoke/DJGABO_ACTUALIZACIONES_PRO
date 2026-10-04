import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/apiClient";
import { Button } from "../../components/primitives";
import { CdgDemoModal, type DemoPlayerQuality } from "../../components/CdgDemoModal";

interface DemoPlayerSettings {
  enabled: boolean;
  startSeconds: number;
  durationSeconds: number;
  quality: DemoPlayerQuality;
}

interface DemoSample {
  karaokeId: string;
  title: string;
  artist: string;
}

const QUALITY_OPTIONS: Array<{ value: DemoPlayerQuality; label: string; description: string }> = [
  { value: "ORIGINAL", label: "ORIGINAL", description: "CDG nativo, píxel directo." },
  { value: "SDF_LAB_V2", label: "SDF LAB V2", description: "Suavizado SDF del motor que ya probamos." },
  { value: "SDF_KARAOKE_PRO", label: "SDF KARAOKE PRO", description: "SDF + tratamiento visual Karaoke PRO." },
];

export default function AdminDemoPlayerPage() {
  const [settings, setSettings] = useState<DemoPlayerSettings | null>(null);
  const [state, setState] = useState<"loading" | "idle" | "saving" | "saved" | "error">("loading");
  const [message, setMessage] = useState("");
  const [sample, setSample] = useState<DemoSample | null>(null);

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

  async function save() {
    if (!settings) return;
    setState("saving");
    setMessage("");
    try {
      const saved = await api.put<DemoPlayerSettings>("/admin/demo-player-settings", settings);
      setSettings(saved);
      setState("saved");
      setMessage("Configuración guardada.");
      setTimeout(() => setState("idle"), 1800);
    } catch (err) {
      setState("error");
      setMessage(err instanceof ApiError ? err.message : "No se pudo guardar.");
    }
  }

  async function testPlayer() {
    setMessage("");
    try {
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

  if (!settings) {
    return (
      <div className="rounded-lg border border-graphite-border bg-graphite p-6 text-sm text-ink-secondary">
        {state === "error" ? message : "Cargando reproductor CDG…"}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Reproductor CDG / Demos</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Controla el demo que ven los clientes dentro de Club Karaoke. Top Hits 01–04 no reproducen demos.
        </p>
      </div>

      <section className="rounded-lg border border-graphite-border bg-graphite p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-semibold text-ink">Demos de Club Karaoke</h2>
            <p className="mt-1 text-xs text-ink-secondary">
              El master completo nunca se entrega al reproductor. El backend sirve únicamente el fragmento configurado.
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
        <p className="mt-1 text-xs text-ink-secondary">
          Esta selección se aplica a todos los demos de Club Karaoke. El cliente no ve este selector.
        </p>

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

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={save} disabled={state === "saving"}>
          {state === "saving" ? "Guardando…" : "Guardar configuración"}
        </Button>
        <Button variant="secondary" onClick={testPlayer} disabled={!settings.enabled}>
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
