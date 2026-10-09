import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DownloadSettingsService } from "../src/services/DownloadSettingsService.js";

let directory = "";
afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = "";
});

describe("Admin policy for individual VIP downloads", () => {
  it("defaults to disabled, persists and loads changes on new instances", async () => {
    directory = await mkdtemp(join(tmpdir(), "djgabo-download-settings-"));
    const path = join(directory, "download-settings.json");
    const a = new DownloadSettingsService(path);
    expect((await a.get()).individualKaraokeDownloadsEnabled).toBe(false);
    await a.update(true);
    expect((await new DownloadSettingsService(path).get()).individualKaraokeDownloadsEnabled).toBe(true);
    await a.update(false);
    const persisted = JSON.parse(await readFile(path, "utf8"));
    expect(persisted.individualKaraokeDownloadsEnabled).toBe(false);
  });
});
