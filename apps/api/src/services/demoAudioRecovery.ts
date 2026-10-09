import { StorageError, type StorageDownloadStream, type StorageMetadata } from "@djgabo/storage";

export interface DemoAudioAsset {
  id: string;
  storageKey: string;
  fileName: string;
  providerFileId: string | null;
  size: number;
}

export interface DemoAudioStorage {
  getSecureFileStream(key: string): Promise<StorageDownloadStream>;
  getSecureFileByProviderFileIdStream(providerFileId: string): Promise<StorageDownloadStream>;
  getMetadata(key: string): Promise<StorageMetadata>;
}

function fileName(path: string): string {
  return (path.split("/").at(-1) ?? "").normalize("NFC").toLocaleLowerCase();
}

/**
 * If a Dropbox WAV was deleted and uploaded again, the ID changes but the
 * original path still points to the correct file. Retry by the *catalogued
 * exact path*, never by a fuzzy song title/search result.
 *
 * Caller must have completed the normal demo source/collection checks.
 */
export async function openDemoAudioWithRecovery(
  storage: DemoAudioStorage,
  asset: DemoAudioAsset,
  options: {
    expectedSource: (key: string) => boolean;
    onRepaired?: (metadata: StorageMetadata) => Promise<void>;
  },
): Promise<StorageDownloadStream> {
  if (asset.providerFileId) {
    try {
      return await storage.getSecureFileByProviderFileIdStream(asset.providerFileId);
    } catch (error) {
      // Only a stale Dropbox ID should trigger a retry. Auth/rate-limit/other
      // errors must not be hidden or bypassed.
      if (!(error instanceof StorageError) || error.reason !== "NOT_FOUND") throw error;
    }
  }

  // Resolve the exact original catalog path, verify filename and file size,
  // then stream it. Never substitute an audio track based on artist/title.
  if (!options.expectedSource(asset.storageKey) || fileName(asset.storageKey) !== fileName(asset.fileName)) {
    throw new StorageError("PATH_INVALID", "La ruta del WAV no coincide con el archivo del catálogo.");
  }
  const metadata = await storage.getMetadata(asset.storageKey);
  if (fileName(metadata.key) !== fileName(asset.storageKey) || metadata.size <= 0) {
    throw new StorageError("PATH_INVALID", "El WAV actual no coincide con la ruta registrada.");
  }
  const stream = await storage.getSecureFileStream(asset.storageKey);
  if (fileName(stream.fileName) !== fileName(asset.fileName)) {
    throw new StorageError("PATH_INVALID", "El nombre del WAV recuperado no coincide con el catálogo.");
  }
  // Successful streaming must not depend on a concurrent catalog repair.
  if (metadata.providerFileId && metadata.providerFileId !== asset.providerFileId) {
    await options.onRepaired?.(metadata);
  }
  return stream;
}
