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
  listFolder(path: string): Promise<StorageEntry[]>;
}

/** Evita path traversal / claves fuera del root configurado. Punto 28. */
export function assertSafeStorageKey(key: string): void {
  if (!key || key.includes("..") || key.startsWith("/") === false) {
    throw new StorageError("PATH_INVALID", `storageKey inválida: "${key}"`);
  }
}
