import { describe, it, expect, beforeEach } from "vitest";
import { AuthorizationService } from "./AuthorizationService.js";
import type {
  AuthorizationRepositoryPort,
  AuthUserRecord,
  AuthCollectionRecord,
  AuthKaraokeRecord,
  AuthAccessRecord,
} from "./types.js";

class FakeRepo implements AuthorizationRepositoryPort {
  users = new Map<string, AuthUserRecord>();
  collections = new Map<string, AuthCollectionRecord>();
  karaokes = new Map<string, AuthKaraokeRecord>();
  access = new Map<string, AuthAccessRecord>();
  devices = new Map<string, Set<string>>();

  async getUser(id: string) {
    return this.users.get(id) ?? null;
  }
  async getCollection(id: string) {
    return this.collections.get(id) ?? null;
  }
  async getKaraoke(id: string) {
    return this.karaokes.get(id) ?? null;
  }
  async getAccess(userId: string, collectionId: string) {
    return this.access.get(`${userId}:${collectionId}`) ?? null;
  }
  async countOtherActiveDevices(userId: string, deviceId: string | null) {
    const set = this.devices.get(userId) ?? new Set();
    return [...set].filter((d) => d !== deviceId).length;
  }
  async isDeviceKnown(userId: string, deviceId: string) {
    return this.devices.get(userId)?.has(deviceId) ?? false;
  }
}

const future = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
const past = new Date(Date.now() - 1000 * 60 * 60 * 24);

describe("AuthorizationService", () => {
  let repo: FakeRepo;
  let auth: AuthorizationService;

  beforeEach(() => {
    repo = new FakeRepo();
    auth = new AuthorizationService(repo);

    repo.users.set("member-active", {
      id: "member-active",
      role: "MEMBER",
      status: "ACTIVE",
      subscriptionEnd: future,
      maxDevices: 2,
    });
    repo.users.set("member-suspended", {
      id: "member-suspended",
      role: "MEMBER",
      status: "SUSPENDED",
      subscriptionEnd: future,
      maxDevices: 2,
    });
    repo.users.set("member-expired-status", {
      id: "member-expired-status",
      role: "MEMBER",
      status: "EXPIRED",
      subscriptionEnd: future,
      maxDevices: 2,
    });
    repo.users.set("member-expired-date", {
      id: "member-expired-date",
      role: "MEMBER",
      status: "ACTIVE",
      subscriptionEnd: past,
      maxDevices: 2,
    });
    repo.users.set("admin-1", {
      id: "admin-1",
      role: "ADMIN",
      status: "ACTIVE",
      subscriptionEnd: null,
      maxDevices: 99,
    });

    repo.collections.set("col-active", { id: "col-active", active: true });
    repo.collections.set("col-inactive", { id: "col-inactive", active: false });

    repo.access.set("member-active:col-active", { enabled: true, expiresAt: null });
    repo.access.set("member-active:col-expired-access", { enabled: true, expiresAt: past });
    repo.access.set("member-active:col-disabled-access", { enabled: false, expiresAt: null });
    repo.collections.set("col-expired-access", { id: "col-expired-access", active: true });
    repo.collections.set("col-disabled-access", { id: "col-disabled-access", active: true });

    repo.karaokes.set("kar-full", {
      id: "kar-full",
      collectionId: "col-active",
      masterAssetId: "asset-master",
      previewAssetId: "asset-preview",
    });
    repo.karaokes.set("kar-no-master", {
      id: "kar-no-master",
      collectionId: "col-active",
      masterAssetId: null,
      previewAssetId: "asset-preview",
    });
  });

  describe("canAccessCollection", () => {
    it("permite a un miembro activo con acceso otorgado", async () => {
      const result = await auth.canAccessCollection("member-active", "col-active");
      expect(result).toEqual({ allowed: true });
    });

    it("rechaza usuario inexistente", async () => {
      const result = await auth.canAccessCollection("ghost", "col-active");
      expect(result).toEqual({ allowed: false, reason: "USER_NOT_FOUND" });
    });

    it("rechaza usuario suspendido", async () => {
      const result = await auth.canAccessCollection("member-suspended", "col-active");
      expect(result).toEqual({ allowed: false, reason: "USER_SUSPENDED" });
    });

    it("rechaza usuario con status EXPIRED", async () => {
      const result = await auth.canAccessCollection("member-expired-status", "col-active");
      expect(result).toEqual({ allowed: false, reason: "USER_EXPIRED" });
    });

    it("rechaza usuario cuya fecha de vencimiento ya pasó aunque status diga ACTIVE", async () => {
      const result = await auth.canAccessCollection("member-expired-date", "col-active");
      expect(result).toEqual({ allowed: false, reason: "USER_EXPIRED" });
    });

    it("rechaza colección inactiva", async () => {
      const result = await auth.canAccessCollection("member-active", "col-inactive");
      expect(result).toEqual({ allowed: false, reason: "COLLECTION_INACTIVE" });
    });

    it("rechaza colección sin registro de acceso", async () => {
      repo.collections.set("col-sin-acceso", { id: "col-sin-acceso", active: true });
      const result = await auth.canAccessCollection("member-active", "col-sin-acceso");
      expect(result).toEqual({ allowed: false, reason: "ACCESS_NOT_GRANTED" });
    });

    it("rechaza acceso deshabilitado explícitamente", async () => {
      const result = await auth.canAccessCollection("member-active", "col-disabled-access");
      expect(result).toEqual({ allowed: false, reason: "ACCESS_DISABLED" });
    });

    it("rechaza acceso vencido (expiresAt en el pasado)", async () => {
      const result = await auth.canAccessCollection("member-active", "col-expired-access");
      expect(result).toEqual({ allowed: false, reason: "ACCESS_EXPIRED" });
    });

    it("un ADMIN activo accede a cualquier colección activa sin UserCollectionAccess", async () => {
      const result = await auth.canAccessCollection("admin-1", "col-active");
      expect(result).toEqual({ allowed: true });
    });

    it("un MEMBER nunca se beneficia de la regla de ADMIN aunque intente forzarlo", async () => {
      repo.collections.set("col-solo-admin", { id: "col-solo-admin", active: true });
      const result = await auth.canAccessCollection("member-active", "col-solo-admin");
      expect(result.allowed).toBe(false);
    });
  });

  describe("canPreviewKaraoke / canDownloadKaraoke", () => {
    it("permite preview cuando hay acceso y previewAsset existe", async () => {
      const result = await auth.canPreviewKaraoke("member-active", "kar-full");
      expect(result).toEqual({ allowed: true });
    });

    it("permite descarga cuando hay acceso y masterAsset existe", async () => {
      const result = await auth.canDownloadKaraoke("member-active", "kar-full");
      expect(result).toEqual({ allowed: true });
    });

    it("rechaza descarga si no hay masterAsset disponible", async () => {
      const result = await auth.canDownloadKaraoke("member-active", "kar-no-master");
      expect(result).toEqual({ allowed: false, reason: "ASSET_NOT_AVAILABLE" });
    });

    it("rechaza karaoke inexistente", async () => {
      const result = await auth.canDownloadKaraoke("member-active", "ghost-karaoke");
      expect(result).toEqual({ allowed: false, reason: "KARAOKE_NOT_FOUND" });
    });

    it("propaga el rechazo de colección al intentar descargar un karaoke de una colección bloqueada", async () => {
      repo.karaokes.set("kar-bloqueado", {
        id: "kar-bloqueado",
        collectionId: "col-inactive",
        masterAssetId: "a",
        previewAssetId: "p",
      });
      const result = await auth.canDownloadKaraoke("member-active", "kar-bloqueado");
      expect(result).toEqual({ allowed: false, reason: "COLLECTION_INACTIVE" });
    });
  });

  describe("límite de dispositivos", () => {
    it("permite descarga si el dispositivo ya está registrado, aunque esté al límite", async () => {
      repo.devices.set("member-active", new Set(["device-a", "device-b"]));
      const result = await auth.canDownloadKaraoke("member-active", "kar-full", "device-a");
      expect(result).toEqual({ allowed: true });
    });

    it("rechaza un dispositivo nuevo que excede maxDevices", async () => {
      repo.devices.set("member-active", new Set(["device-a", "device-b"])); // maxDevices=2
      const result = await auth.canDownloadKaraoke("member-active", "kar-full", "device-c");
      expect(result).toEqual({ allowed: false, reason: "DEVICE_LIMIT_REACHED" });
    });

    it("permite un dispositivo nuevo si aún hay cupo", async () => {
      repo.devices.set("member-active", new Set(["device-a"])); // maxDevices=2
      const result = await auth.canDownloadKaraoke("member-active", "kar-full", "device-c");
      expect(result).toEqual({ allowed: true });
    });

    it("no aplica límite de dispositivos si no se envía deviceId", async () => {
      repo.devices.set("member-active", new Set(["device-a", "device-b", "device-c"]));
      const result = await auth.canDownloadKaraoke("member-active", "kar-full", null);
      expect(result).toEqual({ allowed: true });
    });
  });

  describe("canDownloadCollection", () => {
    it("permite descargar todo cuando hay acceso a la colección y cupo de dispositivo", async () => {
      const result = await auth.canDownloadCollection("member-active", "col-active", "device-a");
      expect(result).toEqual({ allowed: true });
    });

    it("rechaza descarga completa si la colección no está permitida", async () => {
      const result = await auth.canDownloadCollection("member-active", "col-inactive");
      expect(result).toEqual({ allowed: false, reason: "COLLECTION_INACTIVE" });
    });
  });

  describe("canRegisterDevice", () => {
    it("permite registrar un dispositivo nuevo si hay cupo", async () => {
      repo.devices.set("member-active", new Set(["device-a"])); // maxDevices=2
      const result = await auth.canRegisterDevice("member-active");
      expect(result).toEqual({ allowed: true });
    });

    it("rechaza el registro cuando ya se alcanzó maxDevices, sin importar qué deviceId se pida", async () => {
      repo.devices.set("member-active", new Set(["device-a", "device-b"])); // maxDevices=2
      const result = await auth.canRegisterDevice("member-active");
      expect(result).toEqual({ allowed: false, reason: "DEVICE_LIMIT_REACHED" });
    });

    it("rechaza el registro para un usuario suspendido", async () => {
      const result = await auth.canRegisterDevice("member-suspended");
      expect(result).toEqual({ allowed: false, reason: "USER_SUSPENDED" });
    });

    it("rechaza el registro para un usuario vencido por fecha", async () => {
      const result = await auth.canRegisterDevice("member-expired-date");
      expect(result).toEqual({ allowed: false, reason: "USER_EXPIRED" });
    });
  });
});
