import type { StorageEntry, StorageProvider } from "../StorageProvider.js";
import { resolveMimeType } from "../mimeTypes.js";
import type { IndexerRepositoryPort, SyncPlanItem, SyncResult } from "./types.js";
import { parseMonthFolder, parseYearFolder, parseKaraokeFileName, deriveCodeFromKey } from "./filenameParser.js";
import { deriveIdentityKey } from "./identity.js";

const MONTH_TITLES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const AUDIO_VIDEO_EXTENSIONS = new Set(["mp4", "mp3", "wav", "mov", "mkv"]);
const PREVIEWS_FOLDER_NAME = "_PREVIEWS";

/**
 * Recorre el StorageProvider activo (Mock hoy, Dropbox mañana — no le importa
 * cuál) y detecta qué Collections/Karaokes/Assets hay que crear o actualizar
 * en la base de datos. Nunca borra nada (punto 10: "no ejecutar sincronización
 * destructiva"). En modo dryRun no escribe absolutamente nada.
 *
 * EFICIENCIA DE RED (punto 3): toda la metadata que se necesita por archivo
 * (tamaño, fecha, id estable del provider) sale de los mismos `StorageEntry`
 * que ya trae `listFolder` — Dropbox los incluye directamente en
 * `/files/list_folder`. Este servicio NUNCA llama a `getMetadata` por
 * archivo; eso convertiría sincronizar 30,000 archivos en 30,000+ requests
 * innecesarios. Los previews se resuelven listando la subcarpeta
 * `_PREVIEWS` UNA vez por mes y armando un mapa por nombre de archivo, no
 * con una llamada por karaoke.
 */
export class StorageIndexerService {
  constructor(
    private readonly storage: StorageProvider,
    private readonly repo: IndexerRepositoryPort,
  ) {}

  async run(rootPath: string, options: { dryRun: boolean }): Promise<SyncResult> {
    const items: SyncPlanItem[] = [];
    const yearEntries = await this.storage.listFolder(rootPath);

    for (const yearEntry of yearEntries.filter((e) => e.isFolder)) {
      const year = parseYearFolder(yearEntry.name);
      if (year === null) continue;

      const monthEntries = await this.storage.listFolder(yearEntry.path);
      for (const monthEntry of monthEntries.filter((e) => e.isFolder)) {
        const month = parseMonthFolder(monthEntry.name);
        if (month === null) continue;

        const monthContents = await this.storage.listFolder(monthEntry.path);
        const fileEntries = monthContents.filter((e) => !e.isFolder);

        // Un solo listFolder para TODA la subcarpeta _PREVIEWS del mes, sin
        // importar cuántos karaokes tenga — nunca N llamadas (punto 3).
        const previewsByFileName = await this.buildPreviewsMap(monthContents);

        for (const fileEntry of fileEntries) {
          items.push(
            await this.planFile(fileEntry, year, month, previewsByFileName.get(fileEntry.name), options.dryRun),
          );
        }
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

  private async buildPreviewsMap(monthContents: StorageEntry[]): Promise<Map<string, StorageEntry>> {
    const previewsFolder = monthContents.find((e) => e.isFolder && e.name === PREVIEWS_FOLDER_NAME);
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

    if (!AUDIO_VIDEO_EXTENSIONS.has(extension)) {
      return { storageKey, action: "SKIP", year, month, title, artist, code: deriveCodeFromKey(storageKey) };
    }

    try {
      // Identidad interna robusta (punto 1): providerFileId tal cual si
      // list_folder lo trajo, o SHA-256/128 bits de fallback. Nunca se
      // deriva de un hash de 32 bits, y nunca se usa Karaoke.code para esto.
      const providerFileId = fileEntry.providerFileId;
      const identityKey = deriveIdentityKey(this.storage.kind, providerFileId, storageKey);
      const code = deriveCodeFromKey(identityKey); // solo para mostrar en la UI

      let collection = await this.repo.findCollectionByYearMonth(year, month);
      if (!collection) {
        if (dryRun) {
          // DRY-RUN CORRECTO EN MOVES (punto 4): antes de asumir "archivo
          // nuevo" solo porque su mes todavía no tiene Collection, hay que
          // chequear si ya es un karaoke conocido (identidad estable) que
          // simplemente se movió a un mes sin sincronizar todavía. En ese
          // caso es UPDATE, no CREATE — y el dry-run NUNCA crea la colección.
          const existingKaraoke = await this.repo.findKaraokeByIdentityKey(identityKey);
          const action = existingKaraoke ? "UPDATE" : "CREATE";
          return { storageKey, action, year, month, title, artist, code };
        }
        collection = await this.repo.createCollection({
          year,
          month,
          title: `${MONTH_TITLES[month - 1]} ${year}`,
          storagePath: storageKey.split("/").slice(0, -1).join("/"),
        });
      }

      // Prioridad de resolución de identidad del Asset: providerFileId
      // primero (si el provider lo da), storageKey como fallback — así un
      // rename/move nunca crea un Asset duplicado cuando hay id estable.
      // AISLAMIENTO ENTRE PROVIDERS (corrección de esta pasada): ambas
      // búsquedas van scoped a `this.storage.kind` — el mismo providerFileId
      // o el mismo storageKey en OTRO provider son archivos distintos,
      // nunca deben confundirse entre sí.
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

      // Convención de previews (previewConvention.ts): NUNCA se usa el
      // master como preview. La entry ya viene resuelta del mapa construido
      // en run() con un único listFolder por mes — cero requests extra acá.
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
