import { describe, it, expect, vi, beforeEach } from "vitest";
import { DropboxStorageProvider, type DropboxConfig } from "./DropboxStorageProvider.js";
import { StorageError } from "./StorageProvider.js";

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

function baseConfig(fetchImpl: typeof fetch): DropboxConfig {
  return {
    appKey: "test-app-key",
    appSecret: "test-app-secret",
    refreshToken: "test-refresh-token",
    rootPath: "",
    fetchImpl,
  };
}

describe("DropboxStorageProvider", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
  });

  describe("OAuth refresh token", () => {
    it("obtiene un access token nuevo en la primera llamada y lo reutiliza en la siguiente (no vuelve a pedirlo)", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(200, { access_token: "AT-1", expires_in: 14400 }))
        .mockResolvedValueOnce(jsonResponse(200, { size: 100, client_modified: "2026-01-01T00:00:00Z", name: "a.mp4" }))
        .mockResolvedValueOnce(jsonResponse(200, { size: 100, client_modified: "2026-01-01T00:00:00Z", name: "a.mp4" }));

      const provider = new DropboxStorageProvider(baseConfig(fetchMock as unknown as typeof fetch));
      await provider.getMetadata("/a.mp4");
      await provider.getMetadata("/a.mp4");

      const tokenCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes("oauth2/token"));
      expect(tokenCalls).toHaveLength(1);

      const [, tokenInit] = tokenCalls[0]!;
      const sentBody = tokenInit.body as URLSearchParams;
      expect(sentBody.get("grant_type")).toBe("refresh_token");
      expect(sentBody.get("refresh_token")).toBe("test-refresh-token");
      expect(sentBody.get("client_id")).toBe("test-app-key");
      expect(sentBody.get("client_secret")).toBe("test-app-secret");
    });

    it("usa el access token obtenido como Bearer en las llamadas RPC", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(200, { access_token: "AT-secreto", expires_in: 14400 }))
        .mockResolvedValueOnce(jsonResponse(200, { size: 1, client_modified: "2026-01-01T00:00:00Z", name: "a.mp4" }));

      const provider = new DropboxStorageProvider(baseConfig(fetchMock as unknown as typeof fetch));
      await provider.getMetadata("/a.mp4");

      const [, rpcInit] = fetchMock.mock.calls[1]!;
      expect((rpcInit.headers as Record<string, string>).Authorization).toBe("Bearer AT-secreto");
    });

    it("si el token endpoint falla, getMetadata lanza StorageError AUTH_ERROR", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: "invalid_grant" }));
      const provider = new DropboxStorageProvider(baseConfig(fetchMock as unknown as typeof fetch));
      await expect(provider.getMetadata("/a.mp4")).rejects.toMatchObject({ reason: "AUTH_ERROR" });
    });
  });

  describe("manejo de 401 (access token vencido a mitad de sesión)", () => {
    it("descarta el token cacheado, pide uno nuevo y reintenta UNA vez la llamada original", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(200, { access_token: "AT-vieja", expires_in: 14400 })) // token inicial
        .mockResolvedValueOnce(jsonResponse(401, {})) // la llamada RPC falla: token vencido
        .mockResolvedValueOnce(jsonResponse(200, { access_token: "AT-nueva", expires_in: 14400 })) // se pide un token nuevo
        .mockResolvedValueOnce(jsonResponse(200, { size: 55, client_modified: "2026-01-01T00:00:00Z", name: "a.mp4" })); // reintento OK

      const provider = new DropboxStorageProvider(baseConfig(fetchMock as unknown as typeof fetch));
      const metadata = await provider.getMetadata("/a.mp4");

      expect(metadata.size).toBe(55);
      expect(fetchMock).toHaveBeenCalledTimes(4);
      const lastCallInit = fetchMock.mock.calls[3]![1];
      expect((lastCallInit.headers as Record<string, string>).Authorization).toBe("Bearer AT-nueva");
    });
  });

  describe("manejo de 429 (rate limit)", () => {
    it("respeta Retry-After y reintenta hasta que la petición tiene éxito", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(200, { access_token: "AT-1", expires_in: 14400 }))
        .mockResolvedValueOnce(jsonResponse(429, {}, { "Retry-After": "0" }))
        .mockResolvedValueOnce(jsonResponse(200, { size: 10, client_modified: "2026-01-01T00:00:00Z", name: "a.mp4" }));

      const provider = new DropboxStorageProvider(baseConfig(fetchMock as unknown as typeof fetch));
      const metadata = await provider.getMetadata("/a.mp4");

      expect(metadata.size).toBe(10);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("lanza StorageError RATE_LIMITED si el 429 persiste más allá de los reintentos permitidos", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(200, { access_token: "AT-1", expires_in: 14400 }))
        .mockResolvedValue(jsonResponse(429, {}, { "Retry-After": "0" })); // siempre 429 de ahí en más

      const provider = new DropboxStorageProvider(baseConfig(fetchMock as unknown as typeof fetch));
      await expect(provider.getMetadata("/a.mp4")).rejects.toMatchObject({ reason: "RATE_LIMITED" });
    });
  });

  describe("listFolder con paginación por cursor", () => {
    it("combina las entradas de list_folder y list_folder/continue en un solo resultado", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(200, { access_token: "AT-1", expires_in: 14400 }))
        .mockResolvedValueOnce(
          jsonResponse(200, {
            entries: [{ ".tag": "folder", path_display: "/2026", name: "2026" }],
            has_more: true,
            cursor: "cursor-pagina-1",
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse(200, {
            entries: [
              { ".tag": "file", path_display: "/2026/a.mp4", name: "a.mp4", size: 123, client_modified: "2026-01-01T00:00:00Z" },
            ],
            has_more: false,
            cursor: "",
          }),
        );

      const provider = new DropboxStorageProvider(baseConfig(fetchMock as unknown as typeof fetch));
      const entries = await provider.listFolder("/");

      expect(entries).toHaveLength(2);
      expect(entries[0]).toMatchObject({ name: "2026", isFolder: true });
      expect(entries[1]).toMatchObject({ name: "a.mp4", isFolder: false, size: 123 });

      // Segunda llamada RPC debe ser list_folder/continue con el cursor recibido
      const secondRpcUrl = String(fetchMock.mock.calls[2]![0]);
      expect(secondRpcUrl).toContain("/files/list_folder/continue");
      const secondRpcBody = JSON.parse(fetchMock.mock.calls[2]![1].body as string);
      expect(secondRpcBody.cursor).toBe("cursor-pagina-1");
    });

    it("mapea el campo `id` de Dropbox a providerFileId en cada StorageEntry (punto 3 — sin esto, el indexador tendría que pedir get_metadata aparte)", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(200, { access_token: "AT-1", expires_in: 14400 }))
        .mockResolvedValueOnce(
          jsonResponse(200, {
            entries: [
              {
                ".tag": "file",
                id: "id:estable-desde-list-folder",
                path_display: "/2026/a.mp4",
                name: "a.mp4",
                size: 456,
                client_modified: "2026-01-01T00:00:00Z",
              },
            ],
            has_more: false,
            cursor: "",
          }),
        );

      const provider = new DropboxStorageProvider(baseConfig(fetchMock as unknown as typeof fetch));
      const entries = await provider.listFolder("/2026");

      expect(entries[0]?.providerFileId).toBe("id:estable-desde-list-folder");
      // Una sola llamada RPC (list_folder) — ninguna a get_metadata.
      const rpcCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes("/files/"));
      expect(rpcCalls).toHaveLength(1);
    });
  });

  describe("get_temporary_link", () => {
    it("getTemporaryDownloadUrl devuelve el link que da Dropbox, sin transformarlo", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(200, { access_token: "AT-1", expires_in: 14400 }))
        .mockResolvedValueOnce(jsonResponse(200, { link: "https://dl.dropboxusercontent.com/abc123" }));

      const provider = new DropboxStorageProvider(baseConfig(fetchMock as unknown as typeof fetch));
      const url = await provider.getTemporaryDownloadUrl("/a.mp4");

      expect(url).toBe("https://dl.dropboxusercontent.com/abc123");
      const rpcUrl = String(fetchMock.mock.calls[1]![0]);
      expect(rpcUrl).toContain("/files/get_temporary_link");
    });

    it("getTemporaryPreviewUrl usa el mismo mecanismo (el preview es un asset físicamente distinto)", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(200, { access_token: "AT-1", expires_in: 14400 }))
        .mockResolvedValueOnce(jsonResponse(200, { link: "https://dl.dropboxusercontent.com/preview-xyz" }));

      const provider = new DropboxStorageProvider(baseConfig(fetchMock as unknown as typeof fetch));
      const url = await provider.getTemporaryPreviewUrl("/_PREVIEWS/a.mp4");
      expect(url).toBe("https://dl.dropboxusercontent.com/preview-xyz");
    });
  });

  describe("exists()", () => {
    it("devuelve true cuando get_metadata responde 200", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(200, { access_token: "AT-1", expires_in: 14400 }))
        .mockResolvedValueOnce(jsonResponse(200, { size: 1, client_modified: "2026-01-01T00:00:00Z", name: "a.mp4" }));

      const provider = new DropboxStorageProvider(baseConfig(fetchMock as unknown as typeof fetch));
      await expect(provider.exists("/a.mp4")).resolves.toBe(true);
    });

    it("devuelve false cuando get_metadata responde 409 (path/not_found)", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(200, { access_token: "AT-1", expires_in: 14400 }))
        .mockResolvedValueOnce(jsonResponse(409, { error_summary: "path/not_found/." }));

      const provider = new DropboxStorageProvider(baseConfig(fetchMock as unknown as typeof fetch));
      await expect(provider.exists("/no-existe.mp4")).resolves.toBe(false);
    });

    it("propaga (no traga) errores que no son 'no encontrado', por ejemplo rate limit persistente", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(200, { access_token: "AT-1", expires_in: 14400 }))
        .mockResolvedValue(jsonResponse(429, {}, { "Retry-After": "0" }));

      const provider = new DropboxStorageProvider(baseConfig(fetchMock as unknown as typeof fetch));
      await expect(provider.exists("/a.mp4")).rejects.toMatchObject({ reason: "RATE_LIMITED" });
    });
  });

  describe("clasificación de errores 409 (punto 5 y 7 — no todo 409 es NOT_FOUND)", () => {
    it("un 409 con error_summary path/not_found/... se clasifica como NOT_FOUND", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(200, { access_token: "AT-1", expires_in: 14400 }))
        .mockResolvedValueOnce(jsonResponse(409, { error_summary: "path/not_found/." }));

      const provider = new DropboxStorageProvider(baseConfig(fetchMock as unknown as typeof fetch));
      await expect(provider.getMetadata("/no-existe.mp4")).rejects.toMatchObject({ reason: "NOT_FOUND" });
    });

    it("un 409 con estructura tageada { error: { path: { '.tag': 'not_found' } } } también se clasifica como NOT_FOUND (respaldo sin error_summary)", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(200, { access_token: "AT-1", expires_in: 14400 }))
        .mockResolvedValueOnce(jsonResponse(409, { error: { ".tag": "path", path: { ".tag": "not_found" } } }));

      const provider = new DropboxStorageProvider(baseConfig(fetchMock as unknown as typeof fetch));
      await expect(provider.getMetadata("/no-existe.mp4")).rejects.toMatchObject({ reason: "NOT_FOUND" });
    });

    it("un 409 de otro tipo (path/not_file) NUNCA se convierte en NOT_FOUND — se propaga como CONFLICT", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(200, { access_token: "AT-1", expires_in: 14400 }))
        .mockResolvedValueOnce(jsonResponse(409, { error_summary: "path/not_file/." }));

      const provider = new DropboxStorageProvider(baseConfig(fetchMock as unknown as typeof fetch));
      let caught: unknown;
      try {
        await provider.getMetadata("/una-carpeta");
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(StorageError);
      expect(caught).toMatchObject({ reason: "CONFLICT" });
      expect((caught as StorageError).reason).not.toBe("NOT_FOUND");
    });

    it("un 409 de too_many_write_operations tampoco se convierte en NOT_FOUND", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(200, { access_token: "AT-1", expires_in: 14400 }))
        .mockResolvedValueOnce(jsonResponse(409, { error_summary: "too_many_write_operations/." }));

      const provider = new DropboxStorageProvider(baseConfig(fetchMock as unknown as typeof fetch));
      await expect(provider.getMetadata("/a.mp4")).rejects.toMatchObject({ reason: "CONFLICT" });
    });

    it("exists() propaga (no traga) un CONFLICT que no es 'no encontrado'", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(200, { access_token: "AT-1", expires_in: 14400 }))
        .mockResolvedValueOnce(jsonResponse(409, { error_summary: "path/not_file/." }));

      const provider = new DropboxStorageProvider(baseConfig(fetchMock as unknown as typeof fetch));
      await expect(provider.exists("/una-carpeta")).rejects.toMatchObject({ reason: "CONFLICT" });
    });
  });

  describe("mapeo de errores genéricos", () => {
    it("un error inesperado de Dropbox se mapea a StorageError UNKNOWN con el mensaje de error_summary", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(200, { access_token: "AT-1", expires_in: 14400 }))
        .mockResolvedValueOnce(jsonResponse(500, { error_summary: "internal_server_error/..." }));

      const provider = new DropboxStorageProvider(baseConfig(fetchMock as unknown as typeof fetch));

      let caught: unknown;
      try {
        await provider.getMetadata("/a.mp4");
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(StorageError);
      expect(caught).toMatchObject({ reason: "UNKNOWN", message: expect.stringContaining("internal_server_error") });
    });
  });
});
