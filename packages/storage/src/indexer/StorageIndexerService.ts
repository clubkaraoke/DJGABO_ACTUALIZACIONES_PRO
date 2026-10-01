import type { StorageEntry, StorageProvider } from "../StorageProvider.js";
import { resolveMimeType } from "../mimeTypes.js";
import type { IndexerRepositoryPort, SyncPlanItem, SyncResult } from "./types.js";
import { parseMonthFolder, parseYearFolder, parseKaraokeFileName, deriveCodeFromKey } from "./filenameParser.js";
import { deriveIdentityKey } from "./identity.js";

const MONTH_TITLES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

// Los catálogos reales combinan masters de audio/video y paquetes ZIP de
// marcas externas. CDG y otros sidecars se siguen ignorando como masters
// independientes para no duplicar un mismo karaoke lógico.
const MASTER_EXTENSIONS = new Set(["mp4", "mp3", "wav", "mov", "mkv", "zip"]);
const PREVIEWS_FOLDER_NAME = "_PREVIEWS";

/**
 * Recorre el StorageProvider activo (Mock o Dropbox) y detecta qué
 * Collections/Karaokes/Assets hay que crear o actualizar en la base de datos.
 * Nunca borra nada. En modo dryRun no crea/actualiza catálogo.
 *
 * EFICIENCIA DE RED:
 * - usa la metadata incluida en listFolder (incluido providerFileId);
 * - no hace getMetadata por archivo;
 * - cada subcarpeta de marca se lista una sola vez;
 * - _PREVIEWS se lista una sola vez por mes y nunca se confunde con masters.
 */
export class StorageIndexerService {
  constructor(
    private readonly storage: StorageProvider,
    private readonly repo: IndexerRepositoryPort,
  ) {}

  async run(rootPath: string, options: { dryRun: boolean }): Promise<SyncResult> {
    const targets: Array<{ path: string; year: number; month: number }> = [];
    const yearEntries = await this.storage.listFolder(rootPath);

    for (const yearEntry of yearEntries.filter((e) => e.isFolder)) {
      const year = parseYearFolder(yearEntry.name);
      if (year === null) continue;

      const monthTargets = await this.discoverMonthTargets(yearEntry.path, year);
      targets.push(...monthTargets);
    }

    return this.runMonths(targets, options);
  }

  /**
   * Descubre las carpetas mensuales dentro de una carpeta anual real.
   *
   * La mayoría de años tienen los meses directamente debajo del año, pero
   * existen excepciones históricas como 2016:
   *   /5 - Hits Karaoke 2016/5.- Hits Karaoke 2016/1.- ENERO 2016/...
   *
   * Detectamos ese wrapper intermedio cuando contiene varias carpetas que sí
   * parecen meses. Así evitamos interpretar erróneamente el prefijo "5.-" del
   * wrapper como si fuera Mayo.
   */
  private async discoverMonthTargets(
    yearPath: string,
    year: number,
  ): Promise<Array<{ path: string; year: number; month: number }>> {
    const out: Array<{ path: string; year: number; month: number }> = [];
    const entries = await this.storage.listFolder(yearPath);

    for (const entry of entries.filter((e) => e.isFolder)) {
      const directMonth = parseMonthFolder(entry.name);

      // Algunas carpetas anuales históricas tienen un wrapper redundante.
      // Solo lo tratamos como wrapper si dentro hay varias carpetas-mes.
      if (parseYearFolder(entry.name) === year) {
        const children = await this.storage.listFolder(entry.path);
        const nestedMonths = children
          .filter((child) => child.isFolder)
          .map((child) => ({ child, month: parseMonthFolder(child.name) }))
          .filter((item): item is { child: StorageEntry; month: number } => item.month !== null);

        if (nestedMonths.length >= 3) {
          for (const { child, month } of nestedMonths) {
            out.push({ path: child.path, year, month });
          }
          continue;
        }
      }

      if (directMonth !== null) {
        out.push({ path: entry.path, year, month: directMonth });
      }
    }

    return out;
  }

  /**
   * Indexa únicamente los meses afectados por un cambio de Dropbox.
   * Esta es la ruta usada por el webhook incremental: evita recorrer años y
   * meses que no cambiaron. Los targets se deduplican por año/mes.
   */
  async runMonths(
    targets: Array<{ path: string; year: number; month: number }>,
    options: { dryRun: boolean },
  ): Promise<SyncResult> {
    const items: SyncPlanItem[] = [];
    const seen = new Set<string>();

    for (const target of targets) {
      const key = `${target.year}-${target.month}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const monthContents = await this.storage.listFolder(target.path);
      const fileEntries = await this.collectMasterCandidates(monthContents);
      const previewsByFileName = await this.buildPreviewsMap(monthContents);

      for (const fileEntry of fileEntries) {
        items.push(
          await this.planFile(
            fileEntry,
            target.year,
            target.month,
            previewsByFileName.get(fileEntry.name),
            options.dryRun,
          ),
        );
      }
    }

    const result: SyncResult = {
      dryRun: options.dryRun,
      filesDetected: items.length,
      newCount: items.filter((i) => i.action === "CREATE").length,
      updatedCount: items.filter((i) => i.action === "UPDATE").length,
      errorCount: items.filter((i) => i.action === "ERROR").length,
      items,
    };

    await this.repo.recordSyncRun(result);
    return result;
  }

  /**
   * Devuelve todos los archivos descendientes del mes, conservando su path
   * real de marca (01_Club_KARAOKE, 02_KK-Live, etc.). `_PREVIEWS` se excluye
   * explícitamente para que sus archivos jamás entren como masters.
   */
  private async collectMasterCandidates(entries: StorageEntry[]): Promise<StorageEntry[]> {
    const files: StorageEntry[] = [];

    for (const entry of entries) {
      if (!entry.isFolder) {
        files.push(entry);
        continue;
      }
      if (entry.name.toUpperCase() === PREVIEWS_FOLDER_NAME) continue;

      const children = await this.storage.listFolder(entry.path);
      files.push(...(await this.collectMasterCandidates(children)));
    }

    return files;
  }

  private async buildPreviewsMap(monthContents: StorageEntry[]): Promise<Map<string, StorageEntry>> {
    const previewsFolder = monthContents.find(
      (e) => e.isFolder && e.name.toUpperCase() === PREVIEWS_FOLDER_NAME,
    );
    const map = new Map<string, StorageEntry>();
    if (!previewsFolder) return map;

    const previewEntries = await this.storage.listFolder(previewsFolder.path);
    for (const entry of previewEntries.filter((e) => !e.isFolder)) {
      map.set(entry.name, entry);
    }
    return map;
  }

  private async planFile(
    fileEntry: StorageEntry,
    year: number,
    month: number,
    previewEntry: StorageEntry | undefined,
    dryRun: boolean,
  ): Promise<SyncPlanItem> {
    const storageKey = fileEntry.path;
    const { artist, title, extension } = parseKaraokeFileName(fileEntry.name);

    if (!MASTER_EXTENSIONS.has(extension)) {
      return { storageKey, action: "SKIP", year, month, title, artist, code: deriveCodeFromKey(storageKey) };
    }

    try {
      const providerFileId = fileEntry.providerFileId;
      const identityKey = deriveIdentityKey(this.storage.kind, providerFileId, storageKey);
      const code = deriveCodeFromKey(identityKey); // solo para mostrar en la UI

      let collection = await this.repo.findCollectionByYearMonth(year, month);
      if (!collection) {
        if (dryRun) {
          // Antes de asumir CREATE, verifica si la identidad ya existía y el
          // archivo simplemente fue movido a otro mes.
          const existingKaraoke = await this.repo.findKaraokeByIdentityKey(identityKey);
          const action = existingKaraoke ? "UPDATE" : "CREATE";
          return { storageKey, action, year, month, title, artist, code };
        }
        collection = await this.repo.createCollection({
          year,
          month,
          title: `${MONTH_TITLES[month - 1]} ${year}`,
          storagePath: this.collectionStoragePath(storageKey, month),
        });
      }

      // Prioriza providerFileId y usa storageKey como fallback. Ambas búsquedas
      // están aisladas por provider para no mezclar Mock con Dropbox.
      const existingAsset = providerFileId
        ? (await this.repo.findAssetByProviderFileId(this.storage.kind, providerFileId)) ??
          (await this.repo.findAssetByStorageKey(this.storage.kind, storageKey))
        : await this.repo.findAssetByStorageKey(this.storage.kind, storageKey);

      const existingKaraoke = await this.repo.findKaraokeByIdentityKey(identityKey);

      if (dryRun) {
        const size = fileEntry.size ?? 0;
        const moved = existingAsset ? existingAsset.storageKey !== storageKey : false;
        const changed = existingAsset ? existingAsset.size !== size || moved : false;
        const action = !existingAsset || !existingKaraoke ? "CREATE" : changed ? "UPDATE" : "SKIP";
        return { storageKey, action, year, month, title, artist, code };
      }

      const asset = await this.repo.upsertAsset({
        storageKey,
        fileName: fileEntry.name,
        size: fileEntry.size ?? 0,
        mimeType: resolveMimeType(extension),
        type: "MASTER",
        providerFileId: providerFileId ?? null,
      });

      // NUNCA se usa el master como preview. La entry de preview, si existe,
      // ya fue resuelta en el mapa del mes.
      const previewAssetId = previewEntry ? await this.upsertPreviewAsset(previewEntry) : undefined;

      const karaoke = await this.repo.upsertKaraoke({
        collectionId: collection.id,
        identityKey,
        code,
        title,
        artist,
        masterAssetId: asset.id,
        ...(previewAssetId ? { previewAssetId } : {}),
      });

      const action = asset.isNew || karaoke.isNew ? "CREATE" : "UPDATE";
      return { storageKey, action, year, month, title, artist, code };
    } catch (err) {
      return {
        storageKey,
        action: "ERROR",
        year,
        month,
        title,
        artist,
        code: deriveCodeFromKey(storageKey),
        error: err instanceof Error ? err.message : "Error desconocido",
      };
    }
  }

  /**
   * Para un archivo dentro de /MES/MARCA/file conserva como storagePath de la
   * colección la carpeta /MES, no la subcarpeta de marca.
   */
  private collectionStoragePath(storageKey: string, month: number): string {
    const segments = storageKey.split("/").filter(Boolean);
    const monthIndex = segments.findIndex((segment) => parseMonthFolder(segment) === month);
    if (monthIndex >= 0) return `/${segments.slice(0, monthIndex + 1).join("/")}`;
    return storageKey.split("/").slice(0, -1).join("/");
  }

  private async upsertPreviewAsset(previewEntry: StorageEntry): Promise<string> {
    const extension = previewEntry.name.split(".").pop()?.toLowerCase() ?? "";
    const previewAsset = await this.repo.upsertAsset({
      storageKey: previewEntry.path,
      fileName: previewEntry.name,
      size: previewEntry.size ?? 0,
      mimeType: resolveMimeType(extension),
      type: "PREVIEW",
      providerFileId: previewEntry.providerFileId ?? null,
    });
    return previewAsset.id;
  }
}
