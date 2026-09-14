import { describe, it, expect, beforeEach, vi } from "vitest";
import { MockStorageProvider } from "../MockStorageProvider.js";
import { StorageError, type StorageEntry, type StorageProvider } from "../StorageProvider.js";
import { StorageIndexerService } from "./StorageIndexerService.js";
import type { IndexerRepositoryPort, IndexedCollectionRef, IndexedAssetRef } from "./types.js";

interface FakeAssetRow {
  id: string;
  provider: string;
  storageKey: string;
  size: number;
  type: string;
  providerFileId?: string | null;
}
interface FakeKaraokeRow {
  id: string;
  collectionId: string;
  identityKey: string;
  code: string;
  previewAssetId?: string;
}

/** El "almacén" compartido — simula la base de datos real, independiente de qué provider esté sincronizando en cada momento. */
class FakeDb {
  collections = new Map<string, IndexedCollectionRef & { year: number; month: number }>();
  assets = new Map<string, FakeAssetRow>();
  karaokes = new Map<string, FakeKaraokeRow>();
  syncRuns: unknown[] = [];
  seq = 0;
}

/**
 * Repositorio falso en memoria, atado a UN provider (igual que
 * DrizzleIndexerRepository, que recibe `storageProviderKind` en su
 * constructor). Dos instancias pueden compartir el mismo `FakeDb` para
 * simular "la misma base de datos" vista por dos sincronizaciones con
 * providers distintos — exactamente el escenario del punto 4.
 */
class FakeIndexerRepo implements IndexerRepositoryPort {
  constructor(
    private readonly db: FakeDb,
    private readonly storageProviderKind: string,
  ) {}

  get collections() {
    return this.db.collections;
  }
  get assets() {
    return this.db.assets;
  }
  get karaokes() {
    return this.db.karaokes;
  }
  get syncRuns() {
    return this.db.syncRuns;
  }

  async findCollectionByYearMonth(year: number, month: number) {
    return [...this.db.collections.values()].find((c) => c.year === year && c.month === month) ?? null;
  }
  async createCollection(input: { year: number; month: number }) {
    const id = `col-${++this.db.seq}`;
    this.db.collections.set(id, { id, year: input.year, month: input.month });
    return { id };
  }

  async findAssetByStorageKey(provider: string, storageKey: string) {
    const found = [...this.db.assets.values()].find((a) => a.provider === provider && a.storageKey === storageKey);
    return found ? { id: found.id, size: found.size, storageKey: found.storageKey } : null;
  }
  async findAssetByProviderFileId(provider: string, providerFileId: string) {
    const found = [...this.db.assets.values()].find((a) => a.provider === provider && a.providerFileId === providerFileId);
    return found ? { id: found.id, size: found.size, storageKey: found.storageKey } : null;
  }
  async upsertAsset(input: {
    storageKey: string;
    size: number;
    type: string;
    providerFileId?: string | null;
  }): Promise<IndexedAssetRef> {
    // Igual que DrizzleIndexerRepository: la búsqueda de existencia va
    // scoped a `this.storageProviderKind` (el provider de ESTA sincronización),
    // nunca global — dos providers nunca deben "verse" entre sí (punto 1/2).
    const existing = input.providerFileId
      ? [...this.db.assets.values()].find((a) => a.provider === this.storageProviderKind && a.providerFileId === input.providerFileId)
      : [...this.db.assets.values()].find((a) => a.provider === this.storageProviderKind && a.storageKey === input.storageKey);

    if (existing) {
      existing.storageKey = input.storageKey;
      existing.size = input.size;
      existing.type = input.type;
      if (input.providerFileId) existing.providerFileId = input.providerFileId;
      return { id: existing.id, isNew: false };
    }

    const id = `asset-${++this.db.seq}`;
    this.db.assets.set(id, {
      id,
      provider: this.storageProviderKind,
      storageKey: input.storageKey,
      size: input.size,
      type: input.type,
      providerFileId: input.providerFileId ?? undefined,
    });
    return { id, isNew: true };
  }

  async findKaraokeByIdentityKey(identityKey: string) {
    const found = [...this.db.karaokes.values()].find((k) => k.identityKey === identityKey);
    return found ? { id: found.id, collectionId: found.collectionId } : null;
  }
  async upsertKaraoke(input: { collectionId: string; identityKey: string; code: string; previewAssetId?: string }) {
    const existing = [...this.db.karaokes.values()].find((k) => k.identityKey === input.identityKey);
    if (existing) {
      existing.collectionId = input.collectionId;
      existing.code = input.code;
      existing.previewAssetId = input.previewAssetId ?? existing.previewAssetId;
      return { id: existing.id, isNew: false };
    }
    const id = `kar-${++this.db.seq}`;
    this.db.karaokes.set(id, {
      id,
      collectionId: input.collectionId,
      identityKey: input.identityKey,
      code: input.code,
      previewAssetId: input.previewAssetId,
    });
    return { id, isNew: true };
  }

  async recordSyncRun(result: unknown) {
    this.db.syncRuns.push(result);
  }
}

/**
 * Doble mínimo de StorageProvider con `kind` configurable — para simular
 * "esto es una sincronización de Dropbox" en tests sin depender de la red.
 * Misma lógica de listFolder que MockStorageProvider, solo que permite
 * declarar el `kind` que hace falta para probar aislamiento entre
 * providers (MockStorageProvider siempre reporta "mock").
 */
class FakeKindProvider implements StorageProvider {
  readonly kind: "mock" | "dropbox";
  private files = new Map<string, { size: number; providerFileId?: string; modifiedAt: Date }>();

  constructor(kind: "mock" | "dropbox") {
    this.kind = kind;
  }

  seedFile(key: string, opts: { size?: number; providerFileId?: string } = {}): void {
    this.files.set(key, { size: opts.size ?? 45_000_000, providerFileId: opts.providerFileId, modifiedAt: new Date() });
  }

  moveFile(oldKey: string, newKey: string): void {
    const file = this.files.get(oldKey);
    if (!file) throw new StorageError("NOT_FOUND", `No se puede mover: no existe ${oldKey}`);
    this.files.delete(oldKey);
    this.files.set(newKey, file);
  }

  async exists(key: string): Promise<boolean> {
    return this.files.has(key);
  }
  async getMetadata(key: string) {
    const f = this.files.get(key);
    if (!f) throw new StorageError("NOT_FOUND", `Archivo no encontrado: ${key}`);
    return { key, size: f.size, modifiedAt: f.modifiedAt, providerFileId: f.providerFileId };
  }
  async getTemporaryDownloadUrl(): Promise<string> {
    return `${this.kind}://download`;
  }
  async getTemporaryPreviewUrl(): Promise<string> {
    return `${this.kind}://preview`;
  }
  async listFolder(path: string): Promise<StorageEntry[]> {
    const normalized = path.endsWith("/") ? path : `${path}/`;
    const seenFolders = new Set<string>();
    const entries: StorageEntry[] = [];
    for (const [key, file] of this.files.entries()) {
      if (!key.startsWith(normalized)) continue;
      const rest = key.slice(normalized.length);
      const slashIdx = rest.indexOf("/");
      if (slashIdx === -1) {
        entries.push({ path: key, name: rest, isFolder: false, size: file.size, modifiedAt: file.modifiedAt, providerFileId: file.providerFileId });
      } else {
        const folderName = rest.slice(0, slashIdx);
        const folderPath = `${normalized}${folderName}`;
        if (!seenFolders.has(folderPath)) {
          seenFolders.add(folderPath);
          entries.push({ path: folderPath, name: folderName, isFolder: true });
        }
      }
    }
    return entries;
  }
}

describe("StorageIndexerService", () => {
  let storage: MockStorageProvider;
  let repo: FakeIndexerRepo;

  beforeEach(() => {
    storage = new MockStorageProvider();
    storage.seedFile("/ACTUALIZACIONES/2026/09 SEPTIEMBRE/GRUPO 5 - MOTOR Y MOTIVO.mp4");
    storage.seedFile("/ACTUALIZACIONES/2026/09 SEPTIEMBRE/ARMONIA 10 - EL AMOR MAS BONITO.mp4");
    repo = new FakeIndexerRepo(new FakeDb(), "mock");
  });

  it("en DRY_RUN detecta 2 archivos nuevos y no escribe nada en el repositorio", async () => {
    const indexer = new StorageIndexerService(storage, repo);
    const result = await indexer.run("/ACTUALIZACIONES", { dryRun: true });

    expect(result.dryRun).toBe(true);
    expect(result.filesDetected).toBe(2);
    expect(result.newCount).toBe(2);
    expect(repo.collections.size).toBe(0);
    expect(repo.assets.size).toBe(0);
  });

  it("al sincronizar de verdad crea la colección, los assets y los karaokes", async () => {
    const indexer = new StorageIndexerService(storage, repo);
    const result = await indexer.run("/ACTUALIZACIONES", { dryRun: false });

    expect(result.newCount).toBe(2);
    expect(repo.collections.size).toBe(1);
    expect(repo.assets.size).toBe(2);
    expect(repo.karaokes.size).toBe(2);
  });

  it("evita duplicados: correr la sincronización dos veces no crea assets repetidos", async () => {
    const indexer = new StorageIndexerService(storage, repo);
    await indexer.run("/ACTUALIZACIONES", { dryRun: false });
    const second = await indexer.run("/ACTUALIZACIONES", { dryRun: false });

    expect(repo.assets.size).toBe(2); // sigue siendo 2, no 4
    expect(second.newCount).toBe(0);
  });

  it("registra cada corrida vía recordSyncRun, incluso en dry-run", async () => {
    const indexer = new StorageIndexerService(storage, repo);
    await indexer.run("/ACTUALIZACIONES", { dryRun: true });
    expect(repo.syncRuns).toHaveLength(1);
  });

  describe("convención de previews", () => {
    it("asocia el preview cuando existe en la subcarpeta _PREVIEWS con el mismo nombre", async () => {
      storage.seedFile(
        "/ACTUALIZACIONES/2026/09 SEPTIEMBRE/_PREVIEWS/GRUPO 5 - MOTOR Y MOTIVO.mp4",
        { size: 3_000_000 },
      );
      const indexer = new StorageIndexerService(storage, repo);
      await indexer.run("/ACTUALIZACIONES", { dryRun: false });

      const previewAsset = [...repo.assets.values()].find(
        (a) => a.storageKey === "/ACTUALIZACIONES/2026/09 SEPTIEMBRE/_PREVIEWS/GRUPO 5 - MOTOR Y MOTIVO.mp4",
      );
      expect(previewAsset).toBeTruthy();
      expect(previewAsset?.type).toBe("PREVIEW");

      const grupo5Karaoke = [...repo.karaokes.values()].find((k) => k.previewAssetId === previewAsset?.id);
      expect(grupo5Karaoke).toBeTruthy();
    });

    it("nunca usa el master como preview: sin archivo en _PREVIEWS, el karaoke queda sin previewAssetId", async () => {
      const indexer = new StorageIndexerService(storage, repo);
      await indexer.run("/ACTUALIZACIONES", { dryRun: false });

      for (const karaoke of repo.karaokes.values()) {
        expect(karaoke.previewAssetId).toBeUndefined();
      }
      expect([...repo.assets.values()].every((a) => a.type === "MASTER")).toBe(true);
    });

    it("la subcarpeta _PREVIEWS no se cuenta como archivo nuevo en el plan", async () => {
      storage.seedFile(
        "/ACTUALIZACIONES/2026/09 SEPTIEMBRE/_PREVIEWS/GRUPO 5 - MOTOR Y MOTIVO.mp4",
        { size: 3_000_000 },
      );
      const indexer = new StorageIndexerService(storage, repo);
      const result = await indexer.run("/ACTUALIZACIONES", { dryRun: false });

      expect(result.filesDetected).toBe(2);
    });

    it("no borra un preview ya asociado si una corrida posterior no lo vuelve a encontrar", async () => {
      storage.seedFile(
        "/ACTUALIZACIONES/2026/09 SEPTIEMBRE/_PREVIEWS/GRUPO 5 - MOTOR Y MOTIVO.mp4",
        { size: 3_000_000 },
      );
      const indexer = new StorageIndexerService(storage, repo);
      await indexer.run("/ACTUALIZACIONES", { dryRun: false });

      const previewAsset = [...repo.assets.values()].find(
        (a) => a.storageKey === "/ACTUALIZACIONES/2026/09 SEPTIEMBRE/_PREVIEWS/GRUPO 5 - MOTOR Y MOTIVO.mp4",
      );
      const before = [...repo.karaokes.values()].find((k) => k.previewAssetId === previewAsset?.id);
      expect(before).toBeTruthy();

      const storageWithoutPreview = new MockStorageProvider();
      storageWithoutPreview.seedFile("/ACTUALIZACIONES/2026/09 SEPTIEMBRE/GRUPO 5 - MOTOR Y MOTIVO.mp4");
      storageWithoutPreview.seedFile("/ACTUALIZACIONES/2026/09 SEPTIEMBRE/ARMONIA 10 - EL AMOR MAS BONITO.mp4");
      const indexer2 = new StorageIndexerService(storageWithoutPreview, repo);
      await indexer2.run("/ACTUALIZACIONES", { dryRun: false });

      const after = [...repo.karaokes.values()].find((k) => k.previewAssetId === previewAsset?.id);
      expect(after).toBeTruthy(); // el previewAssetId se conserva
    });
  });

  describe("identidad estable por providerFileId", () => {
    it("sincronizar, renombrar conservando el mismo providerFileId, y volver a sincronizar: sigue existiendo 1 Asset y 1 Karaoke", async () => {
      const storageWithId = new MockStorageProvider();
      storageWithId.seedFile("/ACTUALIZACIONES/2026/09 SEPTIEMBRE/GRUPO 5 - MOTOR Y MOTIVO.mp4", {
        providerFileId: "id:dropbox-stable-123",
      });
      const indexer = new StorageIndexerService(storageWithId, repo);

      await indexer.run("/ACTUALIZACIONES", { dryRun: false });
      expect(repo.assets.size).toBe(1);
      expect(repo.karaokes.size).toBe(1);

      storageWithId.moveFile(
        "/ACTUALIZACIONES/2026/09 SEPTIEMBRE/GRUPO 5 - MOTOR Y MOTIVO.mp4",
        "/ACTUALIZACIONES/2026/09 SEPTIEMBRE/GRUPO 5 - MOTOR Y MOTIVO (RENOMBRADO).mp4",
      );

      const result = await indexer.run("/ACTUALIZACIONES", { dryRun: false });

      expect(repo.assets.size).toBe(1); // sigue siendo 1, no 2 — no se duplicó
      expect(repo.karaokes.size).toBe(1); // sigue siendo 1, no 2
      expect(result.newCount).toBe(0); // se reconoce como UPDATE, no CREATE

      const asset = [...repo.assets.values()][0]!;
      expect(asset.storageKey).toBe("/ACTUALIZACIONES/2026/09 SEPTIEMBRE/GRUPO 5 - MOTOR Y MOTIVO (RENOMBRADO).mp4");
      expect(asset.providerFileId).toBe("id:dropbox-stable-123");

      const karaoke = [...repo.karaokes.values()][0]!;
      expect(karaoke.identityKey).toBe("pid:mock:id:dropbox-stable-123"); // provider incluido, nunca un hash de 32 bits
    });

    it("dry-run detecta el rename como UPDATE (no CREATE) cuando hay providerFileId estable", async () => {
      const storageWithId = new MockStorageProvider();
      storageWithId.seedFile("/ACTUALIZACIONES/2026/09 SEPTIEMBRE/GRUPO 5 - MOTOR Y MOTIVO.mp4", {
        providerFileId: "id:dropbox-stable-456",
      });
      const indexer = new StorageIndexerService(storageWithId, repo);
      await indexer.run("/ACTUALIZACIONES", { dryRun: false });

      storageWithId.moveFile(
        "/ACTUALIZACIONES/2026/09 SEPTIEMBRE/GRUPO 5 - MOTOR Y MOTIVO.mp4",
        "/ACTUALIZACIONES/2026/09 SEPTIEMBRE/GRUPO 5 - MOTOR Y MOTIVO (V2).mp4",
      );

      const dryRunResult = await indexer.run("/ACTUALIZACIONES", { dryRun: true });
      const renamedItem = dryRunResult.items.find((i) => i.storageKey.includes("(V2)"));
      expect(renamedItem?.action).toBe("UPDATE");
    });

    it("un archivo movido a otro mes (colección YA existente) actualiza la colección del Karaoke existente en vez de duplicarlo", async () => {
      const storageWithId = new MockStorageProvider();
      storageWithId.seedFile("/ACTUALIZACIONES/2026/09 SEPTIEMBRE/GRUPO 5 - MOTOR Y MOTIVO.mp4", {
        providerFileId: "id:dropbox-stable-789",
      });
      storageWithId.seedFile("/ACTUALIZACIONES/2026/10 OCTUBRE/OTRO ARTISTA - OTRA CANCION.mp4");
      const indexer = new StorageIndexerService(storageWithId, repo);
      await indexer.run("/ACTUALIZACIONES", { dryRun: false });
      const originalCollectionId = [...repo.karaokes.values()].find((k) => k.identityKey.includes("789"))!.collectionId;

      storageWithId.moveFile(
        "/ACTUALIZACIONES/2026/09 SEPTIEMBRE/GRUPO 5 - MOTOR Y MOTIVO.mp4",
        "/ACTUALIZACIONES/2026/10 OCTUBRE/GRUPO 5 - MOTOR Y MOTIVO.mp4",
      );
      await indexer.run("/ACTUALIZACIONES", { dryRun: false });

      expect(repo.karaokes.size).toBe(2);
      const movedKaraoke = [...repo.karaokes.values()].find((k) => k.identityKey.includes("789"))!;
      expect(movedKaraoke.collectionId).not.toBe(originalCollectionId);
    });

    it("mover un archivo con providerFileId conocido a un mes SIN colección todavía existente se reporta como UPDATE en dry-run, y el dry-run no crea la colección", async () => {
      const storageWithId = new MockStorageProvider();
      storageWithId.seedFile("/ACTUALIZACIONES/2026/09 SEPTIEMBRE/GRUPO 5 - MOTOR Y MOTIVO.mp4", {
        providerFileId: "id:move-test-001",
      });
      const indexer = new StorageIndexerService(storageWithId, repo);
      await indexer.run("/ACTUALIZACIONES", { dryRun: false });

      storageWithId.moveFile(
        "/ACTUALIZACIONES/2026/09 SEPTIEMBRE/GRUPO 5 - MOTOR Y MOTIVO.mp4",
        "/ACTUALIZACIONES/2026/12 DICIEMBRE/GRUPO 5 - MOTOR Y MOTIVO.mp4",
      );

      const collectionsBefore = repo.collections.size;
      const dryRunResult = await indexer.run("/ACTUALIZACIONES", { dryRun: true });

      expect(repo.collections.size).toBe(collectionsBefore);
      const movedItem = dryRunResult.items.find((i) => i.storageKey.includes("DICIEMBRE"));
      expect(movedItem?.action).toBe("UPDATE");
    });

    it("sin providerFileId (fallback documentado para providers sin ID estable), un rename SÍ crea un registro nuevo", async () => {
      const indexer = new StorageIndexerService(storage, repo);
      await indexer.run("/ACTUALIZACIONES", { dryRun: false });
      expect(repo.assets.size).toBe(2);

      storage.moveFile(
        "/ACTUALIZACIONES/2026/09 SEPTIEMBRE/GRUPO 5 - MOTOR Y MOTIVO.mp4",
        "/ACTUALIZACIONES/2026/09 SEPTIEMBRE/GRUPO 5 - MOTOR Y MOTIVO (RENOMBRADO).mp4",
      );
      await indexer.run("/ACTUALIZACIONES", { dryRun: false });

      expect(repo.assets.size).toBe(3);
    });

    it("rename/move con un provider tipo Dropbox (kind='dropbox') también actualiza el mismo Asset, no lo duplica", async () => {
      const dropboxLike = new FakeKindProvider("dropbox");
      dropboxLike.seedFile("/ACTUALIZACIONES/2026/09 SEPTIEMBRE/GRUPO 5 - MOTOR Y MOTIVO.mp4", {
        providerFileId: "id:real-dropbox-999",
      });
      const dropboxRepo = new FakeIndexerRepo(new FakeDb(), "dropbox");
      const indexer = new StorageIndexerService(dropboxLike, dropboxRepo);

      await indexer.run("/ACTUALIZACIONES", { dryRun: false });
      expect(dropboxRepo.assets.size).toBe(1);

      dropboxLike.moveFile(
        "/ACTUALIZACIONES/2026/09 SEPTIEMBRE/GRUPO 5 - MOTOR Y MOTIVO.mp4",
        "/ACTUALIZACIONES/2026/09 SEPTIEMBRE/GRUPO 5 (RENOMBRADO EN DROPBOX).mp4",
      );
      const result = await indexer.run("/ACTUALIZACIONES", { dryRun: false });

      expect(dropboxRepo.assets.size).toBe(1); // sigue siendo 1, no se duplicó
      expect(dropboxRepo.karaokes.size).toBe(1);
      expect(result.newCount).toBe(0);
      const asset = [...dropboxRepo.assets.values()][0]!;
      expect(asset.storageKey).toBe("/ACTUALIZACIONES/2026/09 SEPTIEMBRE/GRUPO 5 (RENOMBRADO EN DROPBOX).mp4");
      expect(asset.provider).toBe("dropbox");
    });
  });

  describe("aislamiento entre providers (corrección de esta pasada: no confundir Mock con Dropbox)", () => {
    it("caso crítico: un Asset Mock y un Asset Dropbox con el MISMO storageKey coexisten como dos Assets independientes", async () => {
      const sharedDb = new FakeDb();
      const mockRepo = new FakeIndexerRepo(sharedDb, "mock");
      const dropboxRepo = new FakeIndexerRepo(sharedDb, "dropbox");

      const SAME_PATH = "/ACTUALIZACIONES/2026/09 SEPTIEMBRE/A.mp4";

      // 1) Ya existe un Asset Mock en ese path.
      const mockStorage = new MockStorageProvider();
      mockStorage.seedFile(SAME_PATH);
      await new StorageIndexerService(mockStorage, mockRepo).run("/ACTUALIZACIONES", { dryRun: false });
      expect(sharedDb.assets.size).toBe(1);

      // 2) Se sincroniza Dropbox con el MISMO storageKey pero su propio providerFileId.
      const dropboxStorage = new FakeKindProvider("dropbox");
      dropboxStorage.seedFile(SAME_PATH, { providerFileId: "id:ABC" });
      await new StorageIndexerService(dropboxStorage, dropboxRepo).run("/ACTUALIZACIONES", { dryRun: false });

      // Deben coexistir: 2 Assets independientes, ninguno pisó al otro.
      expect(sharedDb.assets.size).toBe(2);
      const mockAsset = [...sharedDb.assets.values()].find((a) => a.provider === "mock")!;
      const dropboxAsset = [...sharedDb.assets.values()].find((a) => a.provider === "dropbox")!;
      expect(mockAsset.storageKey).toBe(SAME_PATH);
      expect(dropboxAsset.storageKey).toBe(SAME_PATH);
      expect(mockAsset.id).not.toBe(dropboxAsset.id);

      // Y también 2 Karaokes independientes (identidades distintas por provider).
      expect(sharedDb.karaokes.size).toBe(2);
      const identities = [...sharedDb.karaokes.values()].map((k) => k.identityKey);
      expect(new Set(identities).size).toBe(2);
    });

    it("sincronizar Dropbox de nuevo sobre el mismo archivo actualiza SOLO el Asset de Dropbox, nunca el de Mock", async () => {
      const sharedDb = new FakeDb();
      const mockRepo = new FakeIndexerRepo(sharedDb, "mock");
      const dropboxRepo = new FakeIndexerRepo(sharedDb, "dropbox");
      const SAME_PATH = "/ACTUALIZACIONES/2026/09 SEPTIEMBRE/A.mp4";

      const mockStorage = new MockStorageProvider();
      mockStorage.seedFile(SAME_PATH, { size: 1000 });
      await new StorageIndexerService(mockStorage, mockRepo).run("/ACTUALIZACIONES", { dryRun: false });
      const mockAssetBefore = [...sharedDb.assets.values()].find((a) => a.provider === "mock")!;

      const dropboxStorage = new FakeKindProvider("dropbox");
      dropboxStorage.seedFile(SAME_PATH, { providerFileId: "id:ABC", size: 2000 });
      await new StorageIndexerService(dropboxStorage, dropboxRepo).run("/ACTUALIZACIONES", { dryRun: false });
      // segunda sync de Dropbox con tamaño distinto
      dropboxStorage.seedFile(SAME_PATH, { providerFileId: "id:ABC", size: 3000 });
      await new StorageIndexerService(dropboxStorage, dropboxRepo).run("/ACTUALIZACIONES", { dryRun: false });

      const mockAssetAfter = [...sharedDb.assets.values()].find((a) => a.provider === "mock")!;
      const dropboxAssetAfter = [...sharedDb.assets.values()].find((a) => a.provider === "dropbox")!;

      expect(sharedDb.assets.size).toBe(2); // sigue habiendo exactamente 2, no 3
      expect(mockAssetAfter.size).toBe(mockAssetBefore.size); // el asset Mock nunca se tocó
      expect(dropboxAssetAfter.size).toBe(3000); // el de Dropbox sí se actualizó
    });
  });

  describe("eficiencia de red", () => {
    it("sincronizar N archivos no llama a getMetadata ni una sola vez (toda la metadata sale de listFolder)", async () => {
      const bigStorage = new MockStorageProvider();
      for (let i = 0; i < 25; i++) {
        bigStorage.seedFile(`/ACTUALIZACIONES/2026/09 SEPTIEMBRE/ARTISTA ${i} - CANCION ${i}.mp4`, {
          providerFileId: `id:file-${i}`,
        });
      }
      const metadataSpy = vi.spyOn(bigStorage, "getMetadata");
      const indexer = new StorageIndexerService(bigStorage, repo);
      const result = await indexer.run("/ACTUALIZACIONES", { dryRun: false });

      expect(result.newCount).toBe(25);
      expect(metadataSpy).not.toHaveBeenCalled();
    });

    it("lo mismo en dry-run: analizar un catálogo grande tampoco llama a getMetadata", async () => {
      const bigStorage = new MockStorageProvider();
      for (let i = 0; i < 25; i++) {
        bigStorage.seedFile(`/ACTUALIZACIONES/2026/09 SEPTIEMBRE/ARTISTA ${i} - CANCION ${i}.mp4`);
      }
      const metadataSpy = vi.spyOn(bigStorage, "getMetadata");
      const indexer = new StorageIndexerService(bigStorage, repo);
      await indexer.run("/ACTUALIZACIONES", { dryRun: true });

      expect(metadataSpy).not.toHaveBeenCalled();
    });

    it("los previews se resuelven listando _PREVIEWS una sola vez por mes, no con una llamada por karaoke", async () => {
      const s = new MockStorageProvider();
      for (let i = 0; i < 10; i++) {
        const master = `GRUPO ${i} - CANCION ${i}.mp4`;
        s.seedFile(`/ACTUALIZACIONES/2026/09 SEPTIEMBRE/${master}`);
        if (i % 2 === 0) {
          s.seedFile(`/ACTUALIZACIONES/2026/09 SEPTIEMBRE/_PREVIEWS/${master}`, { size: 1_000_000 });
        }
      }
      const metadataSpy = vi.spyOn(s, "getMetadata");
      const listFolderSpy = vi.spyOn(s, "listFolder");
      const indexer = new StorageIndexerService(s, repo);
      await indexer.run("/ACTUALIZACIONES", { dryRun: false });

      expect(metadataSpy).not.toHaveBeenCalled();
      expect(listFolderSpy.mock.calls.length).toBeLessThanOrEqual(5);

      const withPreview = [...repo.karaokes.values()].filter((k) => k.previewAssetId);
      expect(withPreview).toHaveLength(5);
    });
  });
});
