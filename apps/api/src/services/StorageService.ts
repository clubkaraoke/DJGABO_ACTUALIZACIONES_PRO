import type { StorageProvider } from "@djgabo/storage";

/** Convención de ubicación del ZIP pre-armado de una colección (punto 18/24). */
export function resolveArchiveKey(collectionSlug: string): string {
  return `/ARCHIVES/${collectionSlug}.zip`;
}

export interface ArchiveStatus {
  available: boolean;
  size?: number;
}

/**
 * Frontend → API → AuthorizationService → StorageService → StorageProvider.
 *
 * Esta clase es la ÚNICA que invoca al StorageProvider concreto. Ninguna
 * ruta, ni ningún componente React, debe importar Mock/DropboxStorageProvider
 * directamente. Cambiar de proveedor es cambiar qué se inyecta aquí — cero
 * cambios en rutas o UI.
 */
export class StorageService {
  constructor(private readonly provider: StorageProvider) {}

  get providerKind(): "mock" | "dropbox" {
    return this.provider.kind;
  }

  async getDownloadUrl(storageKey: string): Promise<{ url: string; expiresAt: Date | null }> {
    const ttlSeconds = 3600;
    const url = await this.provider.getTemporaryDownloadUrl(storageKey, { expiresInSeconds: ttlSeconds });
    return { url, expiresAt: this.resolveKnownExpiry(ttlSeconds) };
  }

  async getPreviewUrl(storageKey: string): Promise<{ url: string; expiresAt: Date | null }> {
    const ttlSeconds = 600;
    const url = await this.provider.getTemporaryPreviewUrl(storageKey, { expiresInSeconds: ttlSeconds });
    return { url, expiresAt: this.resolveKnownExpiry(ttlSeconds) };
  }

  async getSecureFileStream(storageKey: string) {
    if (!this.provider.downloadFileStream) {
      throw new Error("SECURE_STREAM_NOT_SUPPORTED");
    }
    return this.provider.downloadFileStream(storageKey);
  }

  async getSecureFolderZipStream(storageKey: string) {
    if (!this.provider.downloadFolderZipStream) {
      throw new Error("SECURE_ZIP_STREAM_NOT_SUPPORTED");
    }
    return this.provider.downloadFolderZipStream(storageKey);
  }

  /**
   * SEMÁNTICA DEL TTL (punto 3)
   * ============================
   * `expiresInSeconds` es un pedido, no una garantía: solo MockStorageProvider
   * lo honra de verdad (es su propio código el que firma el token con ese
   * TTL exacto, así que el valor que devolvemos es real). DropboxStorageProvider
   * ignora ese parámetro — `/files/get_temporary_link` no acepta un TTL
   * configurable ni informa uno en su respuesta; Dropbox documenta que sus
   * links temporales duran ~4 horas, pero esa duración no la controlamos ni
   * la conocemos con exactitud desde nuestra app. Devolver aquí un número
   * inventado (los 10 min / 1 h que pedimos) sería mostrarle al cliente una
   * fecha de expiración ficticia. Por eso: `null` para cualquier provider
   * que no sea Mock — ver docs/STORAGE.md para el detalle y la estrategia
   * futura de proxy/gateway si se necesita un TTL corto real para previews.
   */
  private resolveKnownExpiry(ttlSeconds: number): Date | null {
    if (this.provider.kind !== "mock") return null;
    return new Date(Date.now() + ttlSeconds * 1000);
  }

  /**
   * Verifica si existe un ZIP pre-armado para la colección ANTES de intentar
   * generar una URL de descarga. Nunca lanza: si el provider falla al
   * consultar (rate limit, red, etc.), se trata como "no disponible" — el
   * llamador debe poder ofrecer la estrategia MULTI_FILE como alternativa
   * segura en vez de romper la respuesta.
   */
  async getArchiveStatus(collectionSlug: string): Promise<ArchiveStatus> {
    const key = resolveArchiveKey(collectionSlug);
    try {
      const exists = await this.provider.exists(key);
      if (!exists) return { available: false };
      const metadata = await this.provider.getMetadata(key);
      return { available: true, size: metadata.size };
    } catch {
      return { available: false };
    }
  }
}
