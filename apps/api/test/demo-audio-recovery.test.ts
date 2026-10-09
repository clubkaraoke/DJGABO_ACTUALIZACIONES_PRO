import { describe, expect, it, vi } from "vitest";
import { StorageError, type StorageDownloadStream } from "@djgabo/storage";
import { openDemoAudioWithRecovery, type DemoAudioStorage } from "../src/services/demoAudioRecovery.js";

const key = "/2026/09/01_Club_Karaoke/Artista - Tema.wav";
const asset = { id: "ast_01", storageKey: key, fileName: "Artista - Tema.wav", providerFileId: "id:old", size: 100 };
const stream: StorageDownloadStream = {
  body: new ReadableStream<Uint8Array>(),
  fileName: "Artista - Tema.wav",
  contentLength: 150,
  contentType: "audio/wav",
};
function storage(failId = true): DemoAudioStorage {
  return {
    getSecureFileByProviderFileIdStream: vi.fn().mockImplementation(async () => {
      if (failId) throw new StorageError("NOT_FOUND", "Old Dropbox ID deleted");
      return stream;
    }),
    getMetadata: vi.fn().mockResolvedValue({ key, size: 150, providerFileId: "id:new", modifiedAt: new Date() }),
    getSecureFileStream: vi.fn().mockResolvedValue(stream),
  };
}
describe("CDG WAV recovery when WAV reuploaded", () => {
  it("uses the exact original path after stale ID, then repairs ID/size", async () => {
    const dep = storage();
    const onRepaired = vi.fn().mockResolvedValue(undefined);
    const output = await openDemoAudioWithRecovery(dep, asset, { expectedSource: (x) => x.startsWith("/2026/09/01_Club_Karaoke/"), onRepaired });
    expect(output).toBe(stream);
    expect(dep.getSecureFileStream).toHaveBeenCalledWith(key);
    expect(onRepaired).toHaveBeenCalledWith(expect.objectContaining({ providerFileId: "id:new", size: 150 }));
  });
  it("keeps the existing fast ID path when the original WAV wasn't replaced", async () => {
    const dep = storage(false);
    await openDemoAudioWithRecovery(dep, asset, { expectedSource: () => true });
    expect(dep.getSecureFileStream).not.toHaveBeenCalled();
    expect(dep.getMetadata).not.toHaveBeenCalled();
  });
  it("does not hide auth failures and rate limits behind fallback", async () => {
    for (const reason of ["AUTH_ERROR", "RATE_LIMITED", "CONFLICT"] as const) {
      const dep = storage();
      vi.mocked(dep.getSecureFileByProviderFileIdStream).mockRejectedValue(new StorageError(reason, reason));
      await expect(openDemoAudioWithRecovery(dep, asset, { expectedSource: () => true })).rejects.toMatchObject({ reason });
      expect(dep.getMetadata).not.toHaveBeenCalled();
    }
  });
  it("rejects wrong source and changed file name", async () => {
    const dep = storage();
    await expect(openDemoAudioWithRecovery(dep, asset, { expectedSource: () => false })).rejects.toMatchObject({ reason: "PATH_INVALID" });
    await expect(openDemoAudioWithRecovery(dep, { ...asset, fileName: "Otro.wav" }, { expectedSource: () => true })).rejects.toMatchObject({ reason: "PATH_INVALID" });
    expect(dep.getSecureFileByProviderFileIdStream).toHaveBeenCalledTimes(2);
    expect(dep.getMetadata).not.toHaveBeenCalled();
  });
  it("requires a present, nonempty exact WAV, not a similarly named song", async () => {
    const dep = storage();
    vi.mocked(dep.getMetadata).mockResolvedValue({ key, size: 0, providerFileId: "id:new", modifiedAt: new Date() });
    await expect(openDemoAudioWithRecovery(dep, asset, { expectedSource: () => true })).rejects.toMatchObject({ reason: "PATH_INVALID" });
  });
  it("never repairs the catalog if fallback streaming fails", async () => {
    const dep = storage();
    const onRepaired = vi.fn();
    vi.mocked(dep.getSecureFileStream).mockRejectedValue(new StorageError("NOT_FOUND", "Missing"));
    await expect(openDemoAudioWithRecovery(dep, asset, { expectedSource: () => true, onRepaired })).rejects.toMatchObject({ reason: "NOT_FOUND" });
    expect(onRepaired).not.toHaveBeenCalled();
  });
});

