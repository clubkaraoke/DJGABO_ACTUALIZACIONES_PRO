import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export const DEMO_PLAYER_QUALITIES = ["ORIGINAL", "SDF_LAB_V2", "SDF_KARAOKE_PRO"] as const;
export type DemoPlayerQuality = (typeof DEMO_PLAYER_QUALITIES)[number];

export interface DemoPlayerSettings {
  enabled: boolean;
  startSeconds: number;
  durationSeconds: number;
  quality: DemoPlayerQuality;
}

const DEFAULT_SETTINGS: DemoPlayerSettings = {
  enabled: true,
  startSeconds: 35,
  durationSeconds: 60,
  quality: "SDF_KARAOKE_PRO",
};

function sanitize(value: Partial<DemoPlayerSettings> | null | undefined): DemoPlayerSettings {
  const quality = DEMO_PLAYER_QUALITIES.includes(value?.quality as DemoPlayerQuality)
    ? (value!.quality as DemoPlayerQuality)
    : DEFAULT_SETTINGS.quality;

  return {
    enabled: typeof value?.enabled === "boolean" ? value.enabled : DEFAULT_SETTINGS.enabled,
    startSeconds: Number.isFinite(value?.startSeconds)
      ? Math.max(0, Math.min(600, Math.round(value!.startSeconds!)))
      : DEFAULT_SETTINGS.startSeconds,
    durationSeconds: Number.isFinite(value?.durationSeconds)
      ? Math.max(15, Math.min(90, Math.round(value!.durationSeconds!)))
      : DEFAULT_SETTINGS.durationSeconds,
    quality,
  };
}

/**
 * Configuración pequeña y persistente del demo CDG. Vive en el volumen de
 * Railway junto al catálogo, sin requerir una migración de SQLite.
 */
export class DemoPlayerSettingsService {
  private cache: DemoPlayerSettings | null = null;

  constructor(private readonly path: string) {}

  async get(): Promise<DemoPlayerSettings> {
    if (this.cache) return { ...this.cache };
    try {
      const raw = await readFile(this.path, "utf8");
      this.cache = sanitize(JSON.parse(raw) as Partial<DemoPlayerSettings>);
    } catch {
      this.cache = { ...DEFAULT_SETTINGS };
    }
    return { ...this.cache };
  }

  async update(next: Partial<DemoPlayerSettings>): Promise<DemoPlayerSettings> {
    const current = await this.get();
    const value = sanitize({ ...current, ...next });
    await mkdir(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(value, null, 2), "utf8");
    await rename(tmp, this.path);
    this.cache = value;
    return { ...value };
  }
}
