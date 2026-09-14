import type { Role, UserStatus } from "@djgabo/shared";

export interface AuthUserRecord {
  id: string;
  role: Role;
  status: UserStatus;
  subscriptionEnd: Date | null;
  maxDevices: number;
}

export interface AuthCollectionRecord {
  id: string;
  active: boolean;
}

export interface AuthKaraokeRecord {
  id: string;
  collectionId: string;
  masterAssetId: string | null;
  previewAssetId: string | null;
}

export interface AuthAccessRecord {
  enabled: boolean;
  expiresAt: Date | null;
}

/**
 * Puerto que el AuthorizationService necesita para resolver reglas de negocio.
 * La capa API implementa esto contra Prisma. El dominio NUNCA importa Prisma
 * directamente, así las reglas de negocio son testeables sin base de datos.
 */
export interface AuthorizationRepositoryPort {
  getUser(userId: string): Promise<AuthUserRecord | null>;
  getCollection(collectionId: string): Promise<AuthCollectionRecord | null>;
  getKaraoke(karaokeId: string): Promise<AuthKaraokeRecord | null>;
  getAccess(userId: string, collectionId: string): Promise<AuthAccessRecord | null>;
  /** Dispositivos activos del usuario, excluyendo el deviceId indicado si ya está registrado */
  countOtherActiveDevices(userId: string, deviceId: string | null): Promise<number>;
  isDeviceKnown(userId: string, deviceId: string): Promise<boolean>;
}

export type DenyReason =
  | "USER_NOT_FOUND"
  | "USER_SUSPENDED"
  | "USER_EXPIRED"
  | "COLLECTION_NOT_FOUND"
  | "COLLECTION_INACTIVE"
  | "ACCESS_NOT_GRANTED"
  | "ACCESS_DISABLED"
  | "ACCESS_EXPIRED"
  | "DEVICE_LIMIT_REACHED"
  | "KARAOKE_NOT_FOUND"
  | "ASSET_NOT_AVAILABLE";

export interface AuthorizationResult {
  allowed: boolean;
  reason?: DenyReason;
}
