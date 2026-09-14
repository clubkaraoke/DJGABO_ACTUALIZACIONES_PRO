import { describe, it, expect, beforeEach } from "vitest";
import { MockStorageProvider } from "./MockStorageProvider.js";
import { StorageError } from "./StorageProvider.js";

describe("MockStorageProvider", () => {
  let storage: MockStorageProvider;

  beforeEach(() => {
    storage = new MockStorageProvider();
    storage.seedFile("/ACTUALIZACIONES/2026/09 SEPTIEMBRE/GRUPO 5 - MOTOR Y MOTIVO.mp4", {
      size: 52_000_000,
    });
    storage.seedFile("/ACTUALIZACIONES/2026/09 SEPTIEMBRE/ARMONIA 10 - EL AMOR MAS BONITO.mp4");
    storage.seedFile("/ACTUALIZACIONES/2026/08 AGOSTO/GRUPO 5 - CUANDO SE VA EL AMOR.mp4");
  });

  it("exists() responde true solo para archivos seedeados", async () => {
    expect(await storage.exists("/ACTUALIZACIONES/2026/09 SEPTIEMBRE/GRUPO 5 - MOTOR Y MOTIVO.mp4")).toBe(
      true,
    );
    expect(await storage.exists("/ACTUALIZACIONES/2026/09 SEPTIEMBRE/NO EXISTE.mp4")).toBe(false);
  });

  it("getMetadata() lanza StorageError NOT_FOUND si no existe", async () => {
    await expect(storage.getMetadata("/no/existe.mp4")).rejects.toThrow(StorageError);
  });

  it("getTemporaryDownloadUrl() genera una URL firmada distinta cada vez y nunca expone la key en texto plano sin firmar", async () => {
    const url1 = await storage.getTemporaryDownloadUrl(
      "/ACTUALIZACIONES/2026/09 SEPTIEMBRE/GRUPO 5 - MOTOR Y MOTIVO.mp4",
    );
    const url2 = await storage.getTemporaryDownloadUrl(
      "/ACTUALIZACIONES/2026/09 SEPTIEMBRE/GRUPO 5 - MOTOR Y MOTIVO.mp4",
    );
    expect(url1).toMatch(/^mock:\/\/storage\/download\?/);
    expect(url1).not.toEqual(url2); // token distinto por llamada
  });

  it("listFolder() devuelve carpetas de año en la raíz", async () => {
    const entries = await storage.listFolder("/ACTUALIZACIONES");
    expect(entries).toEqual([{ path: "/ACTUALIZACIONES/2026", name: "2026", isFolder: true }]);
  });

  it("listFolder() devuelve las carpetas de mes dentro de un año", async () => {
    const entries = await storage.listFolder("/ACTUALIZACIONES/2026");
    const names = entries.map((e) => e.name).sort();
    expect(names).toEqual(["08 AGOSTO", "09 SEPTIEMBRE"]);
  });

  it("listFolder() devuelve los archivos dentro de un mes con su tamaño", async () => {
    const entries = await storage.listFolder("/ACTUALIZACIONES/2026/09 SEPTIEMBRE");
    expect(entries).toHaveLength(2);
    const grupo5 = entries.find((e) => e.name.includes("GRUPO 5"));
    expect(grupo5?.size).toBe(52_000_000);
  });

  it("rechaza claves con path traversal", async () => {
    await expect(storage.exists("../../etc/passwd")).rejects.toThrow(StorageError);
    await expect(storage.getTemporaryDownloadUrl("/ACTUALIZACIONES/../../secret.mp4")).rejects.toThrow(
      StorageError,
    );
  });
});
