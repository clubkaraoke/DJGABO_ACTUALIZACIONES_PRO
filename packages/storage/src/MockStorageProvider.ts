import {
  StorageError,
  assertSafeStorageKey,
  type StorageEntry,
  type StorageMetadata,
  type StorageProvider,
  type TemporaryUrlOptions,
} from "./StorageProvider.js";

interface MockFile {
  size: number;
  contentType: string;
  modifiedAt: Date;
  /** Simula el ID estable que un provider real (Dropbox) asignaría al archivo. Opcional: por defecto Mock no tiene IDs estables. */
  providerFileId?: string;
}

/**
 * Storage 100% funcional en memoria. Simula exactamente el mismo contrato
 * que DropboxStorageProvider (incluyendo URLs "temporales" con expiración
 * real) para que el resto del sistema (API, indexer, frontend) no necesite
 * saber que Dropbox todavía no está conectado.
 */
export class MockStorageProvider implements StorageProvider {
  readonly kind = "mock" as const;
  private files = new Map<string, MockFile>();

  constructor(seed?: Record<string, MockFile>) {
    if (seed) {
      for (const [key, file] of Object.entries(seed)) this.files.set(key, file);
    }
  }

  /** Utilidad de seed/testing, no forma parte de la interfaz StorageProvider */
  seedFile(key: string, file: Partial<MockFile> = {}): void {
    assertSafeStorageKey(key);
    this.files.set(key, {
      size: file.size ?? 1024 * 1024 * 45,
      contentType: file.contentType ?? "video/mp4",
      modifiedAt: file.modifiedAt ?? new Date(),
      providerFileId: file.providerFileId,
    });
  }

  /**
   * Utilidad de testing: simula un rename/move real de Dropbox — el archivo
   * "aparece" en la nueva ruta conservando el mismo providerFileId (y el
   * resto de sus metadatos), y deja de existir en la ruta vieja. Lanza si el
   * archivo de origen no existe, para detectar errores en los tests.
   */
  moveFile(oldKey: string, newKey: string): void {
    assertSafeStorageKey(oldKey);
    assertSafeStorageKey(newKey);
    const file = this.files.get(oldKey);
    if (!file) throw new StorageError("NOT_FOUND", `No se puede mover: no existe ${oldKey}`);
    this.files.delete(oldKey);
    this.files.set(newKey, file);
  }

  async exists(key: string): Promise<boolean> {
    assertSafeStorageKey(key);
    return this.files.has(key);
  }

  async getMetadata(key: string): Promise<StorageMetadata> {
    assertSafeStorageKey(key);
    const file = this.files.get(key);
    if (!file) throw new StorageError("NOT_FOUND", `Archivo no encontrado: ${key}`);
    return { key, size: file.size, contentType: file.contentType, modifiedAt: file.modifiedAt, providerFileId: file.providerFileId };
  }

  private buildSignedUrl(kind: "download" | "preview", key: string, options?: TemporaryUrlOptions): string {
    const ttl = options?.expiresInSeconds ?? (kind === "preview" ? 600 : 3600);
    const expiresAt = Date.now() + ttl * 1000;
    const token = Buffer.from(`${key}:${expiresAt}:${Math.random().toString(36).slice(2)}`).toString(
      "base64url",
    );
    return `mock://storage/${kind}?key=${encodeURIComponent(key)}&exp=${expiresAt}&token=${token}`;
  }

  async getTemporaryDownloadUrl(key: string, options?: TemporaryUrlOptions): Promise<string> {
    assertSafeStorageKey(key);
    if (!this.files.has(key)) throw new StorageError("NOT_FOUND", `Archivo no encontrado: ${key}`);
    return this.buildSignedUrl("download", key, options);
  }

  async getTemporaryPreviewUrl(key: string, options?: TemporaryUrlOptions): Promise<string> {
    assertSafeStorageKey(key);
    if (!this.files.has(key)) throw new StorageError("NOT_FOUND", `Archivo no encontrado: ${key}`);
    return this.buildSignedUrl("preview", key, options);
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
        entries.push({
          path: key,
          name: rest,
          isFolder: false,
          size: file.size,
          modifiedAt: file.modifiedAt,
          providerFileId: file.providerFileId,
        });
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
