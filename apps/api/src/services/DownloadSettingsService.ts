import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface DownloadSettings {
  individualKaraokeDownloadsEnabled: boolean;
}

/** Persistent Admin policy on the Railway volume; default OFF for members. */
export class DownloadSettingsService {
  private cache: DownloadSettings | null = null;
  constructor(private readonly path: string) {}

  async get(): Promise<DownloadSettings> {
    if (this.cache) return { ...this.cache };
    try {
      const raw = JSON.parse(await readFile(this.path, "utf8")) as Partial<DownloadSettings>;
      this.cache = { individualKaraokeDownloadsEnabled: raw.individualKaraokeDownloadsEnabled === true };
    } catch {
      this.cache = { individualKaraokeDownloadsEnabled: false };
    }
    return { ...this.cache };
  }

  async update(individualKaraokeDownloadsEnabled: boolean): Promise<DownloadSettings> {
    const value = { individualKaraokeDownloadsEnabled };
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = this.path + "." + process.pid + ".tmp";
    await writeFile(temporary, JSON.stringify(value, null, 2), "utf8");
    await rename(temporary, this.path);
    this.cache = value;
    return { ...value };
  }
}
