import type { AssetType } from "@djgabo/shared";

export interface IndexedCollectionRef {
  id: string;
}

export interface IndexedAssetRef {
  id: string;
  isNew: boolean;
}

export interface IndexerRepositoryPort {
  findCollectionByYearMonth(year: number, month: number): Promise<IndexedCollectionRef | null>;
  createCollection(input: { year: number; month: number; title: string; storagePath: string }): Promise<IndexedCollectionRef>;
  findAssetByStorageKey(provider: string, storageKey: string): Promise<{ id: string; size: number; storageKey: string } | null>;
  /**
   * Identidad estable (punto 1 de la pasada anterior): busca por el ID que
   * el provider asigna al archivo, no por su path actual. Scoped por
   * provider (corrección de esta pasada): el mismo `providerFileId` en dos
   * providers distintos son archivos DISTINTOS — nunca deben confundirse.
   */
  findAssetByProviderFileId(provider: string, providerFileId: string): Promise<{ id: string; size: number; storageKey: string } | null>;
  upsertAsset(input: {
    storageKey: string;
    fileName: string;
    size: number;
    mimeType: string;
    type: AssetType;
    /** Si el provider lo da (Dropbox), se usa para reconocer el mismo archivo aunque cambie su storageKey. */
    providerFileId?: string | null;
  }): Promise<IndexedAssetRef>;
  /**
   * Identidad interna robusta (punto 1): busca el karaoke por su
   * `identityKey` (providerFileId tal cual, o SHA-256/128 bits de fallback
   * — ver indexer/identity.ts), NUNCA por `Karaoke.code` (que es solo un
   * valor corto para mostrar en la UI, no un mecanismo de identidad).
   * Sin acotar a colección: si el archivo tiene identidad estable, pudo
   * haberse movido de mes y sigue siendo "el mismo" karaoke.
   */
  findKaraokeByIdentityKey(identityKey: string): Promise<{ id: string; collectionId: string } | null>;
  upsertKaraoke(input: {
    collectionId: string;
    identityKey: string;
    code: string;
    title: string;
    artist: string;
    masterAssetId: string;
    /** Si se omite, NO se toca el previewAssetId existente (nunca se borra un preview ya asociado por no encontrarlo en esta corrida). */
    previewAssetId?: string;
  }): Promise<{ id: string; isNew: boolean }>;
  recordSyncRun(result: {
    dryRun: boolean;
    filesDetected: number;
    newCount: number;
    updatedCount: number;
    errorCount: number;
  }): Promise<void>;
}

export type SyncItemAction = "CREATE" | "UPDATE" | "SKIP" | "ERROR";

export interface SyncPlanItem {
  storageKey: string;
  action: SyncItemAction;
  year: number;
  month: number;
  title: string;
  artist: string;
  code: string;
  error?: string;
}

export interface SyncResult {
  dryRun: boolean;
  filesDetected: number;
  newCount: number;
  updatedCount: number;
  errorCount: number;
  items: SyncPlanItem[];
}
