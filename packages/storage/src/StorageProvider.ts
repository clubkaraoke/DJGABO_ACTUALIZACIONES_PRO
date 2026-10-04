export interface StorageMetadata {
  key: string;
  size: number;
  contentType?: string;
  modifiedAt: Date;
  /**
   * Identificador estable que el PROVIDER asigna al archivo (no nosotros),
   * si es que lo tiene (punto 1). Dropbox lo da (persiste entre renames y
   * moves dentro de la misma cuenta); providers sin este concepto (Mock por
   * defecto) simplemente lo omiten y el indexador cae de vuelta a identificar
   * el archivo por su storageKey, como antes.
   */
  providerFileId?: string;
}

export interface StorageEntry {
  path: string;
  name: string;
  isFolder: boolean;
  size?: number;
  modifiedAt?: Date;
  /**
   * Identificador estable que el PROVIDER asigna al archivo/carpeta, si lo
   * tiene (punto 3). Dropbox lo devuelve directamente en `/files/list_folder`
   * — capturarlo aquí evita tener que pedir `getMetadata` por separado para
   * cada entrada solo para conseguir este dato.
   */
  providerFileId?: string;
}

export interface StorageDownloadStream {
  /** Flujo binario del archivo. Se transmite; nunca se guarda en disco. */
  body: ReadableStream<Uint8Array>;
  contentType: string;
  contentLength: number | null;
  fileName: string;
  /** Para streaming multimedia con Range. */
  statusCode?: number;
  contentRange?: string | null;
  acceptRanges?: string | null;
}

export interface TemporaryUrlOptions {
  /** Segundos de validez del link. Default definido por cada provider. */
  expiresInSeconds?: number;
}

export type StorageErrorReason =
  | "NOT_FOUND"
  | "AUTH_ERROR"
  | "RATE_LIMITED"
  | "PATH_INVALID"
  | "CONFLICT"
  | "UNKNOWN";

export class StorageError extends Error {
  constructor(
    public readonly reason: StorageErrorReason,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "StorageError";
  }
}

/**
 * Contrato único que el resto de la aplicación conoce. El frontend NUNCA ve
 * una implementación concreta: solo consume URLs temporales devueltas por
 * un StorageService que internamente usa uno de estos providers.
 */
export interface StorageProvider {
  readonly kind: "mock" | "dropbox";
  exists(key: string): Promise<boolean>;
  getMetadata(key: string): Promise<StorageMetadata>;
  getTemporaryDownloadUrl(key: string, options?: TemporaryUrlOptions): Promise<string>;
  getTemporaryPreviewUrl(key: string, options?: TemporaryUrlOptions): Promise<string>;
  /**
   * Descarga segura vía backend. Es opcional para providers de prueba;
   * producción Dropbox la implementa sin exponer links ni rutas al cliente.
   */
  downloadFileStream?(key: string): Promise<StorageDownloadStream>;
  /** Streaming de preview con soporte HTTP Range, sin exponer Dropbox al navegador. */
  downloadFileRangeStream?(key: string, rangeHeader: string): Promise<StorageDownloadStream>;
  /** Preferible para Dropbox: el id del provider sobrevive a moves/renames. */
  downloadFileByProviderFileIdStream?(providerFileId: string): Promise<StorageDownloadStream>;
  /** Resuelve el path actual a partir del id estable del provider. */
  getPathForProviderFileId?(providerFileId: string): Promise<string>;
  downloadFolderZipStream?(key: string): Promise<StorageDownloadStream>;
  listFolder(path: string): Promise<StorageEntry[]>;
}

/** Evita path traversal / claves fuera del root configurado. Punto 28. */
export function assertSafeStorageKey(key: string): void {
  if (!key || key.includes("..") || key.startsWith("/") === false) {
    throw new StorageError("PATH_INVALID", `storageKey inválida: "${key}"`);
  }
}
