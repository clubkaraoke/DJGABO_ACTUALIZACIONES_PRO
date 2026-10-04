import crypto from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export const DEMO_PLAYER_QUALITIES = ["ORIGINAL", "SDF_LAB_V2", "SDF_KARAOKE_PRO"] as const;
export type DemoPlayerQuality = (typeof DEMO_PLAYER_QUALITIES)[number];

export const DEMO_BACKGROUND_TYPES = ["solid", "gradient", "image"] as const;
export type DemoBackgroundType = (typeof DEMO_BACKGROUND_TYPES)[number];

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

export interface DemoPlayerSettings {
  enabled: boolean;
  startSeconds: number;
  durationSeconds: number;
  quality: DemoPlayerQuality;
  activePresetId: string;
  presets: DemoVisualPreset[];
}

const DEFAULT_PRESETS: DemoVisualPreset[] = [
  {
    id: "vip-dark",
    name: "DJGABO VIP",
    backgroundType: "gradient",
    backgroundValue: "linear-gradient(135deg,#0A0A0B 0%,#17171B 55%,#0A0A0B 100%)",
    logoUrl: null,
    logoX: 88,
    logoY: 12,
    logoWidth: 14,
    logoOpacity: 0.95,
  },
  {
    id: "black",
    name: "Negro",
    backgroundType: "solid",
    backgroundValue: "#050506",
    logoUrl: null,
    logoX: 88,
    logoY: 12,
    logoWidth: 14,
    logoOpacity: 0.95,
  },
  {
    id: "graphite",
    name: "Grafito",
    backgroundType: "gradient",
    backgroundValue: "linear-gradient(135deg,#111113 0%,#27272A 55%,#111113 100%)",
    logoUrl: null,
    logoX: 88,
    logoY: 12,
    logoWidth: 14,
    logoOpacity: 0.95,
  },
];

const DEFAULT_SETTINGS: DemoPlayerSettings = {
  enabled: true,
  startSeconds: 35,
  durationSeconds: 60,
  quality: "SDF_KARAOKE_PRO",
  activePresetId: "vip-dark",
  presets: DEFAULT_PRESETS,
};

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
}

function cleanName(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const name = value.replace(/[\r\n\t]/g, " ").trim().slice(0, 60);
  return name || fallback;
}

function cleanAssetUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  return /^\/api\/demo-player\/assets\/[a-zA-Z0-9._-]+$/.test(value) ? value : null;
}

function sanitizePreset(value: Partial<DemoVisualPreset>, index: number): DemoVisualPreset {
  const idRaw = typeof value.id === "string" ? value.id.trim() : "";
  const id = /^[a-zA-Z0-9_-]{1,64}$/.test(idRaw)
    ? idRaw
    : `preset-${index + 1}`;

  const backgroundType = DEMO_BACKGROUND_TYPES.includes(value.backgroundType as DemoBackgroundType)
    ? (value.backgroundType as DemoBackgroundType)
    : "gradient";

  let backgroundValue = typeof value.backgroundValue === "string"
    ? value.backgroundValue.trim().slice(0, 600)
    : DEFAULT_PRESETS[0]!.backgroundValue;

  if (backgroundType === "solid" && !/^#[0-9a-fA-F]{6}$/.test(backgroundValue)) {
    backgroundValue = "#0A0A0B";
  }
  if (backgroundType === "gradient" && !/^linear-gradient\([^<>]+\)$/.test(backgroundValue)) {
    backgroundValue = DEFAULT_PRESETS[0]!.backgroundValue;
  }
  if (backgroundType === "image") {
    backgroundValue = cleanAssetUrl(backgroundValue) ?? "";
  }

  return {
    id,
    name: cleanName(value.name, `Preset ${index + 1}`),
    backgroundType,
    backgroundValue,
    logoUrl: cleanAssetUrl(value.logoUrl),
    logoX: clampNumber(value.logoX, 88, 0, 100),
    logoY: clampNumber(value.logoY, 12, 0, 100),
    logoWidth: clampNumber(value.logoWidth, 14, 4, 45),
    logoOpacity: clampNumber(value.logoOpacity, 0.95, 0.1, 1),
  };
}

function sanitize(value: Partial<DemoPlayerSettings> | null | undefined): DemoPlayerSettings {
  const quality = DEMO_PLAYER_QUALITIES.includes(value?.quality as DemoPlayerQuality)
    ? (value!.quality as DemoPlayerQuality)
    : DEFAULT_SETTINGS.quality;

  const rawPresets = Array.isArray(value?.presets) && value!.presets!.length
    ? value!.presets!.slice(0, 20)
    : DEFAULT_PRESETS;
  const presets = rawPresets.map((preset, index) => sanitizePreset(preset, index));

  // IDs duplicados romperían la selección. Se corrigen sin perder el preset.
  const seen = new Set<string>();
  for (let i = 0; i < presets.length; i++) {
    const preset = presets[i]!;
    if (!seen.has(preset.id)) {
      seen.add(preset.id);
      continue;
    }
    let suffix = 2;
    let next = `${preset.id}-${suffix}`;
    while (seen.has(next)) next = `${preset.id}-${++suffix}`;
    preset.id = next;
    seen.add(next);
  }

  const requestedActive = typeof value?.activePresetId === "string" ? value.activePresetId : "";
  const activePresetId = presets.some((preset) => preset.id === requestedActive)
    ? requestedActive
    : presets[0]!.id;

  return {
    enabled: typeof value?.enabled === "boolean" ? value.enabled : DEFAULT_SETTINGS.enabled,
    startSeconds: Number.isFinite(value?.startSeconds)
      ? Math.max(0, Math.min(600, Math.round(value!.startSeconds!)))
      : DEFAULT_SETTINGS.startSeconds,
    durationSeconds: Number.isFinite(value?.durationSeconds)
      ? Math.max(15, Math.min(90, Math.round(value!.durationSeconds!)))
      : DEFAULT_SETTINGS.durationSeconds,
    quality,
    activePresetId,
    presets,
  };
}

const MIME_EXTENSIONS: Record<string, { ext: string; contentType: string }> = {
  "image/png": { ext: "png", contentType: "image/png" },
  "image/jpeg": { ext: "jpg", contentType: "image/jpeg" },
  "image/webp": { ext: "webp", contentType: "image/webp" },
};

function parseDataUrl(dataUrl: string): { data: Buffer; ext: string; contentType: string } {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new Error("INVALID_IMAGE");
  const meta = MIME_EXTENSIONS[match[1]!];
  if (!meta) throw new Error("INVALID_IMAGE");
  const data = Buffer.from(match[2]!, "base64");
  if (data.length === 0 || data.length > 6 * 1024 * 1024) throw new Error("IMAGE_TOO_LARGE");
  return { data, ext: meta.ext, contentType: meta.contentType };
}

/**
 * Configuración y branding persistentes del demo CDG.
 * Vive en el volumen /data de Railway durante LAB; al migrar a OVH el mismo
 * archivo/directorio puede copiarse sin cambiar el contrato del frontend.
 */
export class DemoPlayerSettingsService {
  private cache: DemoPlayerSettings | null = null;
  private readonly assetsDir: string;

  constructor(private readonly path: string) {
    this.assetsDir = join(dirname(path), "demo-player-assets");
  }

  async get(): Promise<DemoPlayerSettings> {
    if (this.cache) return structuredClone(this.cache);
    try {
      const raw = await readFile(this.path, "utf8");
      this.cache = sanitize(JSON.parse(raw) as Partial<DemoPlayerSettings>);
    } catch {
      this.cache = sanitize(DEFAULT_SETTINGS);
    }
    return structuredClone(this.cache);
  }

  async update(next: Partial<DemoPlayerSettings>): Promise<DemoPlayerSettings> {
    const current = await this.get();
    const value = sanitize({ ...current, ...next });
    await mkdir(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(value, null, 2), "utf8");
    await rename(tmp, this.path);
    this.cache = value;
    return structuredClone(value);
  }

  async saveImage(kind: "background" | "logo", dataUrl: string): Promise<string> {
    const parsed = parseDataUrl(dataUrl);
    await mkdir(this.assetsDir, { recursive: true });
    const fileName = `${kind}-${crypto.randomUUID()}.${parsed.ext}`;
    await writeFile(join(this.assetsDir, fileName), parsed.data);
    return `/api/demo-player/assets/${fileName}`;
  }

  async readImage(fileName: string): Promise<{ data: Buffer; contentType: string } | null> {
    if (!/^(?:background|logo)-[a-f0-9-]+\.(?:png|jpg|webp)$/.test(fileName)) return null;
    try {
      const data = await readFile(join(this.assetsDir, fileName));
      const ext = fileName.split(".").pop()?.toLowerCase();
      const contentType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
      return { data, contentType };
    } catch {
      return null;
    }
  }
}
