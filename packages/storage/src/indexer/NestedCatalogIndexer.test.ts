import { describe, expect, it } from "vitest";
import { MockStorageProvider } from "../MockStorageProvider.js";
import { StorageIndexerService } from "./StorageIndexerService.js";
import type { IndexerRepositoryPort, IndexedAssetRef, IndexedCollectionRef } from "./types.js";

class MemoryRepo implements IndexerRepositoryPort {
  collections = new Map<string, IndexedCollectionRef & { year: number; month: number; storagePath: string }>();
  assets = new Map<string, { id: string; provider: string; storageKey: string; size: number; mimeType: string; providerFileId?: string | null }>();
  karaokes = new Map<string, { id: string; identityKey: string; collectionId: string }>();
  seq = 0;

  async findCollectionByYearMonth(year: number, month: number) {
    return [...this.collections.values()].find((row) => row.year === year && row.month === month) ?? null;
  }

  async createCollection(input: { year: number; month: number; storagePath: string }) {
    const id = `col-${++this.seq}`;
    this.collections.set(id, { id, year: input.year, month: input.month, storagePath: input.storagePath });
    return { id };
  }

  async findAssetByStorageKey(provider: string, storageKey: string) {
    const row = [...this.assets.values()].find((asset) => asset.provider === provider && asset.storageKey === storageKey);
    return row ? { id: row.id, size: row.size, storageKey: row.storageKey } : null;
  }

  async findAssetByProviderFileId(provider: string, providerFileId: string) {
    const row = [...this.assets.values()].find((asset) => asset.provider === provider && asset.providerFileId === providerFileId);
    return row ? { id: row.id, size: row.size, storageKey: row.storageKey } : null;
  }

  async upsertAsset(input: {
    storageKey: string;
    size: number;
    mimeType: string;
    providerFileId?: string | null;
  }): Promise<IndexedAssetRef> {
    const existing = [...this.assets.values()].find((asset) => asset.provider === "mock" && asset.storageKey === input.storageKey);
    if (existing) {
      existing.size = input.size;
      existing.mimeType = input.mimeType;
      return { id: existing.id, isNew: false };
    }
    const id = `ast-${++this.seq}`;
    this.assets.set(id, {
      id,
      provider: "mock",
      storageKey: input.storageKey,
      size: input.size,
      mimeType: input.mimeType,
      providerFileId: input.providerFileId,
    });
    return { id, isNew: true };
  }

  async findKaraokeByIdentityKey(identityKey: string) {
    const row = [...this.karaokes.values()].find((karaoke) => karaoke.identityKey === identityKey);
    return row ? { id: row.id, collectionId: row.collectionId } : null;
  }

  async upsertKaraoke(input: { collectionId: string; identityKey: string }) {
    const existing = [...this.karaokes.values()].find((karaoke) => karaoke.identityKey === input.identityKey);
    if (existing) return { id: existing.id, isNew: false };
    const id = `kar-${++this.seq}`;
    this.karaokes.set(id, { id, identityKey: input.identityKey, collectionId: input.collectionId });
    return { id, isNew: true };
  }

  async recordSyncRun() {}
}

describe("StorageIndexerService — catálogo real DJGABO", () => {
  it("recorre subcarpetas de marca y crea WAV/MP4/ZIP sin convertir CDG en karaoke separado", async () => {
    const storage = new MockStorageProvider();
    storage.seedFile("/ACTUALIZACIONES/2026/05 MAYO/01_Club_KARAOKE/Natalia Lafourcade - Hasta la raiz KARAOKE (Coro).wav");
    storage.seedFile("/ACTUALIZACIONES/2026/05 MAYO/01_Club_KARAOKE/Natalia Lafourcade - Hasta la raiz KARAOKE (Coro).cdg");
    storage.seedFile("/ACTUALIZACIONES/2026/05 MAYO/02_KK-Live/Carin Leon y Grupo Frontera - Al Chile Si.mp4");
    storage.seedFile("/ACTUALIZACIONES/2026/05 MAYO/04_Dj_SA/Grupo Firme - Cabron Y Medio [DJ Sauly Karaoke].zip");

    const repo = new MemoryRepo();
    const result = await new StorageIndexerService(storage, repo).run("/ACTUALIZACIONES", { dryRun: false });

    expect(repo.karaokes.size).toBe(3);
    expect(repo.assets.size).toBe(3);
    expect(result.newCount).toBe(3);
    expect(result.items.some((item) => item.storageKey.endsWith(".cdg") && item.action === "SKIP")).toBe(true);
    expect([...repo.assets.values()].find((asset) => asset.storageKey.endsWith(".zip"))?.mimeType).toBe("application/zip");
    expect([...repo.collections.values()][0]?.storagePath).toBe("/ACTUALIZACIONES/2026/05 MAYO");
  });

  it("reconoce la carpeta real '15.- Hits Karaoke 2026' sin exigir que se llame solo 2026", async () => {
    const storage = new MockStorageProvider();
    storage.seedFile("/CATALOGO/15.- Hits Karaoke 2026/05_MAYO_2026/02_KK-Live/Vicente Fernandez - Mi Unico Camino.mp4");

    const repo = new MemoryRepo();
    const result = await new StorageIndexerService(storage, repo).run("/CATALOGO", { dryRun: false });

    expect(result.newCount).toBe(1);
    expect(repo.karaokes.size).toBe(1);
    expect([...repo.collections.values()][0]?.year).toBe(2026);
    expect([...repo.collections.values()][0]?.month).toBe(5);
  });
});
