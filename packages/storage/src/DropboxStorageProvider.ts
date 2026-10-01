import {
  StorageError,
  assertSafeStorageKey,
  type StorageDownloadStream,
  type StorageEntry,
  type StorageMetadata,
  type StorageProvider,
  type TemporaryUrlOptions,
} from "./StorageProvider.js";
import { parseYearFolder } from "./indexer/filenameParser.js";

export interface DropboxConfig {
  appKey: string;
  appSecret: string;
  refreshToken: string;
  rootPath: string;
  /** Namespace estable del catálogo compartido, usado solo como fallback de descargas seguras. */
  downloadNamespaceId?: string;
  /** Inyectable para tests; por defecto usa el fetch global de Node 22+ */
  fetchImpl?: typeof fetch;
}

const TOKEN_URL = "https://api.dropboxapi.com/oauth2/token";
const RPC_URL = "https://api.dropboxapi.com/2";
const CONTENT_URL = "https://content.dropboxapi.com/2";

interface DropboxApiError {
  error_summary?: string;
  error?: unknown;
}

export interface DropboxChangeEntry {
  path: string;
  name: string;
  kind: "file" | "folder" | "deleted";
  size?: number;
  modifiedAt?: Date;
  providerFileId?: string;
}

export interface DropboxDeltaResult {
  entries: DropboxChangeEntry[];
  cursor: string;
}

/**
 * Un 409 de Dropbox significa "conflicto", NO necesariamente "no existe".
 * Dropbox lo usa para reportar cualquier error específico de la operación
 * (path/not_found, pero también path/not_file, path/not_folder,
 * path/malformed_path, too_many_write_operations, etc. — cada endpoint
 * define su propio árbol de errores). Solo el árbol "path/not_found"
 * (verificado por `error_summary` y, como respaldo, por la estructura
 * tageada `{ error: { path: { ".tag": "not_found" } } }`) se clasifica
 * como NOT_FOUND (punto 5) — cualquier otro 409 se propaga como CONFLICT,
 * nunca se disfraza de "no encontrado".
 */
function isPathNotFoundError(err: DropboxApiError): boolean {
  if (typeof err.error_summary === "string" && err.error_summary.startsWith("path/not_found")) {
    return true;
  }
  const errorNode = err.error as Record<string, unknown> | undefined;
  const pathNode = errorNode?.["path"] as Record<string, unknown> | undefined;
  return pathNode?.[".tag"] === "not_found";
}

/**
 * Adaptador contra la API v2 de Dropbox usando OAuth2 refresh token
 * (recomendado por Dropbox para apps de larga duración: el refresh token no
 * expira, el access token de corta duración se renueva en memoria).
 *
 * Implementado estructuralmente y listo para producción: solo requiere que
 * DROPBOX_APP_KEY / DROPBOX_APP_SECRET / DROPBOX_REFRESH_TOKEN /
 * DROPBOX_ROOT_PATH existan en el entorno. Ver docs/DROPBOX_SETUP.md.
 */
export class DropboxStorageProvider implements StorageProvider {
  readonly kind = "dropbox" as const;
  private accessToken: string | null = null;
  private accessTokenExpiresAt = 0;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: DropboxConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  private resolvePath(key: string): string {
    assertSafeStorageKey(key);
    // "/" representa la raíz lógica configurada del catálogo. Dropbox no
    // acepta una barra final extra como raíz de list_folder, así que devolvemos
    // exactamente DROPBOX_ROOT_PATH sin el slash final.
    const root = this.config.rootPath.replace(/\/$/, "");
    if (key === "/") return root;
    return key.startsWith(root) ? key : `${root}${key}`;
  }

  private toDownloadNamespacePath(key: string): string {
    const segments = key.split("/").filter(Boolean);
    const rootSegments = this.config.rootPath.split("/").filter(Boolean);
    const rootName = rootSegments.at(-1)?.toLocaleLowerCase();

    if (rootName) {
      const rootIndex = segments.findIndex(
        (segment) => segment.toLocaleLowerCase() === rootName,
      );
      if (rootIndex >= 0) {
        const relative = segments.slice(rootIndex + 1);
        return relative.length ? `/${relative.join("/")}` : "";
      }
    }

    // El namespace configurado apunta directamente a la raíz del catálogo.
    // Si el path proviene de path_display (con carpetas personales previas),
    // recortamos todo lo anterior a la carpeta del año.
    const yearIndex = segments.findIndex((segment) => parseYearFolder(segment) !== null);
    if (yearIndex >= 0) {
      return `/${segments.slice(yearIndex).join("/")}`;
    }

    return key.startsWith("/") ? key : `/${key}`;
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.accessTokenExpiresAt - 30_000) {
      return this.accessToken;
    }
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: this.config.refreshToken,
      client_id: this.config.appKey,
      client_secret: this.config.appSecret,
    });
    const res = await this.fetchImpl(TOKEN_URL, { method: "POST", body });
    if (!res.ok) {
      throw new StorageError("AUTH_ERROR", `No se pudo renovar el access token de Dropbox (${res.status})`);
    }
    const data = (await res.json()) as { access_token: string; expires_in: number };
    this.accessToken = data.access_token;
    this.accessTokenExpiresAt = Date.now() + data.expires_in * 1000;
    return this.accessToken;
  }

  /** Llama a un endpoint RPC de Dropbox, maneja 401 (retry 1x), 429 (rate limit) y mapea errores. */
  private async rpc<T>(endpoint: string, payload: unknown, attempt = 0): Promise<T> {
    const token = await this.getAccessToken();
    const res = await this.fetchImpl(`${RPC_URL}${endpoint}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (res.status === 401 && attempt === 0) {
      this.accessToken = null; // fuerza refresh y reintenta una vez
      return this.rpc<T>(endpoint, payload, attempt + 1);
    }

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("Retry-After") ?? "1");
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        return this.rpc<T>(endpoint, payload, attempt + 1);
      }
      throw new StorageError("RATE_LIMITED", "Límite de peticiones de Dropbox excedido");
    }

    if (res.status === 409) {
      const err = (await res.json()) as DropboxApiError;
      if (isPathNotFoundError(err)) {
        throw new StorageError("NOT_FOUND", err.error_summary ?? "Recurso no encontrado en Dropbox", err);
      }
      // Cualquier otro conflicto (path/not_file, path/not_folder,
      // too_many_write_operations, etc.) se propaga con su propia
      // categoría — nunca se trata como "no encontrado".
      throw new StorageError("CONFLICT", err.error_summary ?? `Conflicto al operar sobre el recurso en Dropbox (409)`, err);
    }

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as DropboxApiError;
      throw new StorageError(
        "UNKNOWN",
        err.error_summary ?? `Error Dropbox ${res.status}`,
        err,
      );
    }

    return (await res.json()) as T;
  }

  /** Descargas binarias desde content.dropboxapi.com con el mismo manejo de auth/rate limit. */
  private async content(
    endpoint: string,
    payload: unknown,
    attempt = 0,
    pathRootNamespaceId?: string,
  ): Promise<Response> {
    const token = await this.getAccessToken();
    const res = await this.fetchImpl(`${CONTENT_URL}${endpoint}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Dropbox-API-Arg": JSON.stringify(payload),
        ...(pathRootNamespaceId
          ? {
              "Dropbox-API-Path-Root": JSON.stringify({
                ".tag": "namespace_id",
                namespace_id: pathRootNamespaceId,
              }),
            }
          : {}),
      },
    });

    if (res.status === 401 && attempt === 0) {
      this.accessToken = null;
      return this.content(endpoint, payload, attempt + 1, pathRootNamespaceId);
    }

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("Retry-After") ?? "1");
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        return this.content(endpoint, payload, attempt + 1, pathRootNamespaceId);
      }
      throw new StorageError("RATE_LIMITED", "Límite de peticiones de Dropbox excedido");
    }

    if (res.status === 409) {
      const err = (await res.json().catch(() => ({}))) as DropboxApiError;
      if (isPathNotFoundError(err)) {
        throw new StorageError("NOT_FOUND", err.error_summary ?? "Recurso no encontrado en Dropbox", err);
      }
      throw new StorageError(
        "CONFLICT",
        err.error_summary ?? `Conflicto al descargar desde Dropbox (409)`,
        err,
      );
    }

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as DropboxApiError;
      throw new StorageError("UNKNOWN", err.error_summary ?? `Error Dropbox ${res.status}`, err);
    }

    if (!res.body) {
      throw new StorageError("UNKNOWN", "Dropbox devolvió una descarga sin cuerpo");
    }

    return res;
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.getMetadata(key);
      return true;
    } catch (err) {
      if (err instanceof StorageError && err.reason === "NOT_FOUND") return false;
      throw err;
    }
  }

  async getMetadata(key: string): Promise<StorageMetadata> {
    const path = this.resolvePath(key);
    const data = await this.rpc<{
      id: string;
      size: number;
      client_modified: string;
      name: string;
    }>("/files/get_metadata", { path });
    return {
      key,
      size: data.size,
      modifiedAt: new Date(data.client_modified),
      // `id` de Dropbox (formato "id:XXXXXXXXXXXXXXXXXXXX") persiste aunque
      // el archivo se renombre o se mueva de carpeta dentro de la misma
      // cuenta — es la identidad estable que el indexador prioriza (punto 1).
      providerFileId: data.id,
    };
  }

  async getTemporaryDownloadUrl(key: string, _options?: TemporaryUrlOptions): Promise<string> {
    const path = this.resolvePath(key);
    // /files/get_temporary_link devuelve un link HTTPS directo válido ~4 horas.
    const data = await this.rpc<{ link: string }>("/files/get_temporary_link", { path });
    return data.link;
  }

  async getTemporaryPreviewUrl(key: string, options?: TemporaryUrlOptions): Promise<string> {
    // Los previews son assets físicamente distintos (más cortos/comprimidos),
    // por eso comparten el mismo mecanismo de link temporal que la descarga.
    return this.getTemporaryDownloadUrl(key, options);
  }

  async downloadFileStream(key: string): Promise<StorageDownloadStream> {
    const path = this.resolvePath(key);
    const res = await this.content("/files/download", { path });
    const fileName = path.split("/").filter(Boolean).pop() ?? "archivo";
    const contentLengthHeader = res.headers.get("content-length");
    return {
      body: res.body!,
      contentType: res.headers.get("content-type") ?? "application/octet-stream",
      contentLength: contentLengthHeader ? Number(contentLengthHeader) : null,
      fileName,
    };
  }

  async downloadFileByProviderFileIdStream(providerFileId: string): Promise<StorageDownloadStream> {
    const res = await this.content("/files/download", { path: providerFileId });
    const argHeader = res.headers.get("dropbox-api-result");
    let fileName = "archivo";
    if (argHeader) {
      try {
        const parsed = JSON.parse(argHeader) as { name?: string };
        if (parsed.name) fileName = parsed.name;
      } catch {
        // El nombre es decorativo; la descarga sigue siendo válida.
      }
    }
    const contentLengthHeader = res.headers.get("content-length");
    return {
      body: res.body!,
      contentType: res.headers.get("content-type") ?? "application/octet-stream",
      contentLength: contentLengthHeader ? Number(contentLengthHeader) : null,
      fileName,
    };
  }

  async getPathForProviderFileId(providerFileId: string): Promise<string> {
    const data = await this.rpc<{
      id: string;
      name: string;
      path_display?: string;
      path_lower?: string;
    }>("/files/get_metadata", { path: providerFileId });
    const path = data.path_display ?? data.path_lower;
    if (!path) {
      throw new StorageError("NOT_FOUND", `El archivo ${providerFileId} no tiene un path montado actualmente`);
    }
    return path;
  }

  async downloadFolderZipStream(key: string): Promise<StorageDownloadStream> {
    const path = key.startsWith("id:") ? key : this.resolvePath(key);
    let res: Response;
    try {
      res = await this.content("/files/download_zip", { path });
    } catch (error) {
      if (
        error instanceof StorageError &&
        error.reason === "NOT_FOUND" &&
        !key.startsWith("id:") &&
        this.config.downloadNamespaceId
      ) {
        const namespacePath = this.toDownloadNamespacePath(key);
        res = await this.content(
          "/files/download_zip",
          { path: namespacePath },
          0,
          this.config.downloadNamespaceId,
        );
      } else {
        throw error;
      }
    }
    const folderName = key.startsWith("id:")
      ? "coleccion"
      : path.split("/").filter(Boolean).pop() ?? "coleccion";
    const contentLengthHeader = res.headers.get("content-length");
    return {
      body: res.body!,
      contentType: "application/zip",
      contentLength: contentLengthHeader ? Number(contentLengthHeader) : null,
      fileName: `${folderName}.zip`,
    };
  }

  /**
   * Devuelve un cursor de Dropbox para el estado ACTUAL de un árbol.
   * Se usa una sola vez al arrancar el watcher incremental; después cada
   * webhook continúa desde el cursor persistido y procesa únicamente deltas.
   */
  async getLatestCursor(path: string): Promise<string> {
    const resolved = this.resolvePath(path);
    const data = await this.rpc<{ cursor: string }>("/files/list_folder/get_latest_cursor", {
      path: resolved === "" ? "" : resolved,
      recursive: true,
      include_deleted: true,
      include_non_downloadable_files: true,
    });
    return data.cursor;
  }

  /**
   * Consume TODAS las páginas pendientes desde un cursor de Dropbox.
   * Incluye altas, cambios, moves/renames y tombstones (deleted). El cursor
   * retornado solo debe persistirse después de que la capa superior termine
   * de indexar/publicar correctamente, para no perder eventos ante un fallo.
   */
  async listChanges(cursor: string): Promise<DropboxDeltaResult> {
    const entries: DropboxChangeEntry[] = [];
    let nextCursor = cursor;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const data = await this.rpc<{
        entries: Array<{
          ".tag": "file" | "folder" | "deleted";
          id?: string;
          path_display?: string;
          path_lower?: string;
          name?: string;
          size?: number;
          client_modified?: string;
        }>;
        has_more: boolean;
        cursor: string;
      }>("/files/list_folder/continue", { cursor: nextCursor });

      for (const e of data.entries) {
        const pathDisplay = e.path_display ?? e.path_lower ?? "";
        const name = e.name ?? pathDisplay.split("/").filter(Boolean).pop() ?? "";
        if (!pathDisplay) continue;
        entries.push({
          path: pathDisplay,
          name,
          kind: e[".tag"],
          size: e.size,
          modifiedAt: e.client_modified ? new Date(e.client_modified) : undefined,
          providerFileId: e.id,
        });
      }

      nextCursor = data.cursor;
      if (!data.has_more) break;
    }

    return { entries, cursor: nextCursor };
  }

  async listFolder(path: string): Promise<StorageEntry[]> {
    const resolved = this.resolvePath(path);
    const entries: StorageEntry[] = [];

    let data = await this.rpc<{
      entries: Array<{
        [k: string]: unknown;
        ".tag": string;
        id?: string;
        path_display: string;
        name: string;
        size?: number;
        client_modified?: string;
      }>;
      has_more: boolean;
      cursor: string;
    }>("/files/list_folder", { path: resolved === "" ? "" : resolved, recursive: false });

    // eslint-disable-next-line no-constant-condition
    while (true) {
      for (const e of data.entries) {
        entries.push({
          path: e.path_display,
          name: e.name,
          isFolder: e[".tag"] === "folder",
          size: e.size,
          modifiedAt: e.client_modified ? new Date(e.client_modified) : undefined,
          // Punto 3: Dropbox ya entrega el id estable acá mismo — nunca hace
          // falta un get_metadata aparte solo para conseguirlo.
          providerFileId: e.id,
        });
      }
      if (!data.has_more) break;
      // Manejo de paginación por cursor, como pide el punto 9.
      data = await this.rpc("/files/list_folder/continue", { cursor: data.cursor });
    }

    return entries;
  }
}

/** Lee la config de Dropbox desde variables de entorno. Devuelve null si falta alguna. */
export function loadDropboxConfigFromEnv(env: NodeJS.ProcessEnv = process.env): DropboxConfig | null {
  const appKey = env.DROPBOX_APP_KEY;
  const appSecret = env.DROPBOX_APP_SECRET;
  const refreshToken = env.DROPBOX_REFRESH_TOKEN;
  const rootPath = env.DROPBOX_ROOT_PATH ?? "/ACTUALIZACIONES";
  const downloadNamespaceId = env.DROPBOX_DOWNLOAD_NAMESPACE_ID;
  if (!appKey || !appSecret || !refreshToken) return null;
  return { appKey, appSecret, refreshToken, rootPath, downloadNamespaceId };
}
