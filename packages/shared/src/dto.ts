import type { Role, UserStatus, AssetType, DownloadType } from "./enums.js";

export interface MeDTO {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: Role;
  status: UserStatus;
  plan: { id: string; name: string; slug: string; maxDevices: number } | null;
  subscriptionStart: string | null;
  subscriptionEnd: string | null;
  maxDevices: number;
  devicesUsed: number;
}

export interface LoginResponseDTO {
  accessToken: string;
  refreshToken: string;
  user: MeDTO;
}

export interface CollectionSummaryDTO {
  id: string;
  slug: string;
  title: string;
  year: number;
  month: number;
  description: string | null;
  coverUrl: string | null;
  karaokeCount: number;
  updatedAt: string;
  publishedAt: string | null;
  /** Si el usuario NO tiene acceso, locked=true y no se exponen conteos sensibles adicionales */
  locked: boolean;
}

export interface KaraokeSummaryDTO {
  id: string;
  title: string;
  artist: string;
  code: string;
  genre: string | null;
  year: number | null;
  format: string | null;
  size: number | null;
  coverUrl: string | null;
  collectionId: string;
  hasPreview: boolean;
  hasMaster: boolean;
  publishedAt: string | null;
  /** Subcarpeta/marca de origen dentro del mes, por ejemplo 02_KK-Live. */
  sourceGroup?: string | null;
}

export interface CollectionDetailDTO {
  collection: CollectionSummaryDTO;
  karaokes: KaraokeSummaryDTO[];
}

export interface TemporaryUrlDTO {
  url: string;
  /**
   * null cuando el provider no puede informar una expiración real (ver
   * docs/STORAGE.md — DropboxStorageProvider no fabrica un TTL ficticio).
   */
  expiresAt: string | null;
  type: AssetType;
  fileName: string;
  mimeType: string;
}

export interface ArchiveStatusDTO {
  available: boolean;
  size?: number;
}

export interface DownloadLogEntryDTO {
  id: string;
  userId: string;
  userName: string;
  karaokeId: string | null;
  collectionId: string | null;
  type: DownloadType;
  createdAt: string;
}

export interface AdminClientRowDTO {
  id: string;
  name: string;
  email: string;
  plan: string | null;
  status: UserStatus;
  subscriptionStart: string | null;
  subscriptionEnd: string | null;
  devicesUsed: number;
  maxDevices: number;
  accessibleCollections: number;
}

export interface AdminDashboardStatsDTO {
  downloadsToday: number;
  downloadsThisWeek: number;
  activeUsers: number;
  topKaraokes: { id: string; title: string; artist: string; downloads: number }[];
  topCollections: { id: string; title: string; downloads: number }[];
}

export interface SyncStatusDTO {
  provider: "mock" | "dropbox";
  lastSyncAt: string | null;
  filesDetected: number;
  newCount: number;
  updatedCount: number;
  errorCount: number;
  dryRun: boolean;
}

export interface ApiErrorDTO {
  error: string;
  message: string;
  statusCode: number;
}
