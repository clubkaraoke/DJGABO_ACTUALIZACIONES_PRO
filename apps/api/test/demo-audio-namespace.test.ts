import { describe, expect, it, vi } from "vitest";
import { DropboxStorageProvider } from "@djgabo/storage";

const path = "/15.- Hits Karaoke 2026/09_SEPTIEMBRE_2026/01_Club_Karaoke/Bray On - Tema KARAOKE.wav";
function build(responseCode: "NOT_FOUND" | "CONFLICT" = "NOT_FOUND", useNamespace = true) {
  const payloads: Array<{ path: string; namespace: string | null }> = [];
  const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
    if (url.includes("/oauth2/token")) {
      return new Response(JSON.stringify({ access_token: "test-token", expires_in: 3600 }), { status: 200 });
    }
    const headers = init.headers as Record<string, string>;
    const arg = JSON.parse(headers["Dropbox-API-Arg"]!);
    const namespace = headers["Dropbox-API-Path-Root"] ?? null;
    payloads.push({ path: arg.path, namespace });
    if (namespace && arg.path === path) {
      return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200, headers: { "content-length": "4", "content-type": "audio/x-wav" } });
    }
    const error_summary = responseCode === "NOT_FOUND" ? "path/not_found/" : "path/not_file/";
    return new Response(JSON.stringify({ error_summary, error: { ".tag": "path", path: { ".tag": responseCode === "NOT_FOUND" ? "not_found" : "not_file" } } }), { status: 409 });
  });
  const provider = new DropboxStorageProvider({
    appKey: "k", appSecret: "s", refreshToken: "r",
    rootPath: "/Dropbox/Colección Karaoke Top Hits Mundiales",
    downloadNamespaceId: useNamespace ? "12541936211" : undefined,
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
  return { provider, payloads };
}
describe("Dropbox: WAV restored to same path, new file ID", () => {
  it("retries a failed content download with the configured catalog namespace", async () => {
    const { provider, payloads } = build();
    const out = await provider.downloadFileStream(path);
    expect(out.contentLength).toBe(4);
    expect(out.fileName).toBe("Bray On - Tema KARAOKE.wav");
    expect(new Uint8Array(await new Response(out.body).arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(payloads).toHaveLength(2);
    expect(payloads[0]?.namespace).toBeNull();
    expect(JSON.parse(payloads[1]!.namespace!)).toMatchObject({ ".tag": "namespace_id", namespace_id: "12541936211" });
    expect(payloads[1]?.path).toBe(path);
  });
  it("without the configured namespace, a missing WAV remains NOT_FOUND", async () => {
    const { provider, payloads } = build("NOT_FOUND", false);
    await expect(provider.downloadFileStream(path)).rejects.toMatchObject({ reason: "NOT_FOUND" });
    expect(payloads).toHaveLength(1);
  });
  it("does not retry other Dropbox conflicts in a different namespace", async () => {
    const { provider, payloads } = build("CONFLICT");
    await expect(provider.downloadFileStream(path)).rejects.toMatchObject({ reason: "CONFLICT" });
    expect(payloads).toHaveLength(1);
  });
});
