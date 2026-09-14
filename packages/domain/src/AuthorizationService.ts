import { UserStatus } from "@djgabo/shared";
import type {
  AuthorizationRepositoryPort,
  AuthorizationResult,
  AuthUserRecord,
} from "./types.js";

const deny = (reason: AuthorizationResult["reason"]): AuthorizationResult => ({
  allowed: false,
  reason,
});
const allow: AuthorizationResult = { allowed: true };

/**
 * Punto único de autorización del sistema. Ninguna otra capa (rutas API,
 * componentes React) debe reimplementar estas reglas: siempre se consulta
 * a este servicio.
 */
export class AuthorizationService {
  constructor(private readonly repo: AuthorizationRepositoryPort) {}

  private checkUserActive(user: AuthUserRecord | null): AuthorizationResult {
    if (!user) return deny("USER_NOT_FOUND");
    if (user.status === UserStatus.SUSPENDED) return deny("USER_SUSPENDED");
    if (user.status === UserStatus.EXPIRED) return deny("USER_EXPIRED");
    if (user.subscriptionEnd && user.subscriptionEnd.getTime() < Date.now()) {
      return deny("USER_EXPIRED");
    }
    return allow;
  }

  async canAccessCollection(userId: string, collectionId: string): Promise<AuthorizationResult> {
    const user = await this.repo.getUser(userId);
    const userCheck = this.checkUserActive(user);
    if (!userCheck.allowed) return userCheck;

    const collection = await this.repo.getCollection(collectionId);
    if (!collection) return deny("COLLECTION_NOT_FOUND");
    if (!collection.active) return deny("COLLECTION_INACTIVE");

    // ADMIN ve todo, pero esto es solo para el panel /admin, nunca para servir
    // archivos de un cliente MEMBER a nombre de otro usuario.
    if (user!.role === "ADMIN") return allow;

    const access = await this.repo.getAccess(userId, collectionId);
    if (!access) return deny("ACCESS_NOT_GRANTED");
    if (!access.enabled) return deny("ACCESS_DISABLED");
    if (access.expiresAt && access.expiresAt.getTime() < Date.now()) {
      return deny("ACCESS_EXPIRED");
    }
    return allow;
  }

  private async checkDeviceLimit(
    user: AuthUserRecord,
    deviceId: string | null,
  ): Promise<AuthorizationResult> {
    if (!deviceId) return allow;
    const known = await this.repo.isDeviceKnown(user.id, deviceId);
    if (known) return allow;
    const others = await this.repo.countOtherActiveDevices(user.id, deviceId);
    if (others >= user.maxDevices) return deny("DEVICE_LIMIT_REACHED");
    return allow;
  }

  /**
   * Autoriza el REGISTRO de un dispositivo nuevo (punto 5: el deviceId ya no
   * lo elige el cliente — lo emite el servidor solo si hay cupo). Se llama
   * una única vez por dispositivo físico, antes de emitir su device token
   * firmado; después de eso, ese dispositivo pasa a ser "conocido" para
   * `checkDeviceLimit` y nunca vuelve a competir por cupo.
   */
  async canRegisterDevice(userId: string): Promise<AuthorizationResult> {
    const user = await this.repo.getUser(userId);
    const userCheck = this.checkUserActive(user);
    if (!userCheck.allowed) return userCheck;

    const activeCount = await this.repo.countOtherActiveDevices(userId, null);
    if (activeCount >= user!.maxDevices) return deny("DEVICE_LIMIT_REACHED");
    return allow;
  }

  async canPreviewKaraoke(userId: string, karaokeId: string): Promise<AuthorizationResult> {
    const karaoke = await this.repo.getKaraoke(karaokeId);
    if (!karaoke) return deny("KARAOKE_NOT_FOUND");

    const collectionCheck = await this.canAccessCollection(userId, karaoke.collectionId);
    if (!collectionCheck.allowed) return collectionCheck;

    if (!karaoke.previewAssetId) return deny("ASSET_NOT_AVAILABLE");
    return allow;
  }

  async canDownloadKaraoke(
    userId: string,
    karaokeId: string,
    deviceId: string | null = null,
  ): Promise<AuthorizationResult> {
    const karaoke = await this.repo.getKaraoke(karaokeId);
    if (!karaoke) return deny("KARAOKE_NOT_FOUND");

    const collectionCheck = await this.canAccessCollection(userId, karaoke.collectionId);
    if (!collectionCheck.allowed) return collectionCheck;

    const user = await this.repo.getUser(userId);
    const deviceCheck = await this.checkDeviceLimit(user!, deviceId);
    if (!deviceCheck.allowed) return deviceCheck;

    if (!karaoke.masterAssetId) return deny("ASSET_NOT_AVAILABLE");
    return allow;
  }

  async canDownloadCollection(
    userId: string,
    collectionId: string,
    deviceId: string | null = null,
  ): Promise<AuthorizationResult> {
    const collectionCheck = await this.canAccessCollection(userId, collectionId);
    if (!collectionCheck.allowed) return collectionCheck;

    const user = await this.repo.getUser(userId);
    return this.checkDeviceLimit(user!, deviceId);
  }
}
