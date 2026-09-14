export const Role = {
  ADMIN: "ADMIN",
  MEMBER: "MEMBER",
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const UserStatus = {
  ACTIVE: "ACTIVE",
  EXPIRED: "EXPIRED",
  SUSPENDED: "SUSPENDED",
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const AssetType = {
  MASTER: "MASTER",
  PREVIEW: "PREVIEW",
  COVER: "COVER",
  ARCHIVE: "ARCHIVE",
} as const;
export type AssetType = (typeof AssetType)[keyof typeof AssetType];

export const StorageProviderKind = {
  MOCK: "mock",
  DROPBOX: "dropbox",
} as const;
export type StorageProviderKind = (typeof StorageProviderKind)[keyof typeof StorageProviderKind];

export const DownloadType = {
  KARAOKE: "KARAOKE",
  COLLECTION_ARCHIVE: "COLLECTION_ARCHIVE",
  COLLECTION_MULTI: "COLLECTION_MULTI",
} as const;
export type DownloadType = (typeof DownloadType)[keyof typeof DownloadType];

export const BatchStrategy = {
  PREBUILT_ARCHIVE: "PREBUILT_ARCHIVE",
  MULTI_FILE: "MULTI_FILE",
} as const;
export type BatchStrategy = (typeof BatchStrategy)[keyof typeof BatchStrategy];
