import { api, apiEndpoint } from "./apiClient";
import { withDeviceToken } from "./deviceToken";

export interface DownloadTicketResponse {
  downloadPath: string;
  expiresAt: string;
  expiresInSeconds: number;
}

export interface CollectionDownloadStatus {
  canDownload: boolean;
  denialReason: string | null;
  timezone: string;
  downloadsToday: number;
  maxDownloadsPerDay: number;
  distinctCollectionsToday: number;
  maxDistinctCollectionsPerDay: number;
  selected: boolean;
  selectedCollections: number;
  maxSelectedCollections: number | null;
}

export function openSecureDownload(downloadPath: string): void {
  window.location.href = apiEndpoint(downloadPath);
}

export async function getCollectionDownloadStatus(collectionId: string): Promise<CollectionDownloadStatus> {
  return api.get<CollectionDownloadStatus>(`/downloads/collection/${collectionId}/status`);
}

export async function createCollectionDownloadTicket(collectionId: string): Promise<DownloadTicketResponse> {
  return withDeviceToken((deviceToken) =>
    api.post<DownloadTicketResponse>(
      `/downloads/collection/${collectionId}/ticket`,
      undefined,
      { "X-Device-Token": deviceToken },
    ),
  );
}

export async function createKaraokeDownloadTicket(karaokeId: string): Promise<DownloadTicketResponse> {
  return withDeviceToken((deviceToken) =>
    api.post<DownloadTicketResponse>(
      `/downloads/karaoke/${karaokeId}/ticket`,
      undefined,
      { "X-Device-Token": deviceToken },
    ),
  );
}
