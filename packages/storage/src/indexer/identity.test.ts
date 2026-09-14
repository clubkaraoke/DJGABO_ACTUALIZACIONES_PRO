import { describe, it, expect } from "vitest";
import { deriveIdentityKey } from "./identity.js";

describe("deriveIdentityKey", () => {
  it("dos providerFileId diferentes nunca producen la misma identidad interna", () => {
    const a = deriveIdentityKey("dropbox", "id:AAAAAAAAAAAAAAAAAAAA", "/da/lo/mismo.mp4");
    const b = deriveIdentityKey("dropbox", "id:BBBBBBBBBBBBBBBBBBBB", "/da/lo/mismo.mp4");
    expect(a).not.toBe(b);
  });

  it("un providerFileId se usa tal cual (con prefijo y provider), nunca se hashea", () => {
    const key = deriveIdentityKey("dropbox", "id:XYZ123", "/cualquier/path.mp4");
    expect(key).toBe("pid:dropbox:id:XYZ123");
  });

  it("el mismo providerFileId siempre produce la misma identidad, sin importar el storageKey", () => {
    const a = deriveIdentityKey("dropbox", "id:ESTABLE", "/ACTUALIZACIONES/2026/09 SEPTIEMBRE/a.mp4");
    const b = deriveIdentityKey("dropbox", "id:ESTABLE", "/ACTUALIZACIONES/2026/12 DICIEMBRE/a-renombrado.mp4");
    expect(a).toBe(b); // exactamente el punto de tener un id estable: sobrevive al rename/move
  });

  it("sin providerFileId, la identidad se deriva de SHA-256 del storageKey (fallback), no de un hash de 32 bits", () => {
    const key = deriveIdentityKey("mock", undefined, "/ACTUALIZACIONES/2026/09 SEPTIEMBRE/a.mp4");
    expect(key.startsWith("sk:mock:")).toBe(true);
    const hexPart = key.slice("sk:mock:".length);
    expect(hexPart).toHaveLength(32); // 128 bits en hex, muy por encima del mínimo de 96/128 bits pedido
    expect(/^[0-9a-f]{32}$/.test(hexPart)).toBe(true);
  });

  it("dos storageKeys distintos (fallback sin providerFileId) producen identidades distintas", () => {
    const a = deriveIdentityKey("mock", undefined, "/ACTUALIZACIONES/2026/09 SEPTIEMBRE/a.mp4");
    const b = deriveIdentityKey("mock", undefined, "/ACTUALIZACIONES/2026/09 SEPTIEMBRE/b.mp4");
    expect(a).not.toBe(b);
  });

  it("una identidad basada en providerFileId nunca coincide con una de fallback, aunque las cadenas crudas fueran iguales", () => {
    const viaProvider = deriveIdentityKey("dropbox", "coincidencia", "/otro/path.mp4");
    const viaFallback = deriveIdentityKey("dropbox", undefined, "coincidencia");
    expect(viaProvider).not.toBe(viaFallback);
    expect(viaProvider.startsWith("pid:")).toBe(true);
    expect(viaFallback.startsWith("sk:")).toBe(true);
  });

  it("null se trata igual que undefined (cae al fallback)", () => {
    const withNull = deriveIdentityKey("mock", null, "/a.mp4");
    const withUndefined = deriveIdentityKey("mock", undefined, "/a.mp4");
    expect(withNull).toBe(withUndefined);
  });

  it("no es un hash de 32 bits: para 500 storageKeys distintos no hay colisiones", () => {
    const keys = new Set<string>();
    for (let i = 0; i < 500; i++) {
      keys.add(deriveIdentityKey("mock", undefined, `/ACTUALIZACIONES/2026/09 SEPTIEMBRE/ARTISTA ${i} - CANCION ${i}.mp4`));
    }
    expect(keys.size).toBe(500); // sin colisiones — un hash de 32 bits tendría probabilidad no despreciable de fallar acá
  });

  describe("aislamiento entre providers (corrección de esta pasada)", () => {
    it("el mismo providerFileId en providers DISTINTOS produce identidades distintas", () => {
      const dropbox = deriveIdentityKey("dropbox", "id:ABC", "/A.mp4");
      const mock = deriveIdentityKey("mock", "id:ABC", "/A.mp4");
      expect(dropbox).not.toBe(mock);
    });

    it("el mismo storageKey en providers DISTINTOS (fallback) produce identidades distintas", () => {
      const dropbox = deriveIdentityKey("dropbox", undefined, "/ACTUALIZACIONES/2026/09 SEPTIEMBRE/A.mp4");
      const mock = deriveIdentityKey("mock", undefined, "/ACTUALIZACIONES/2026/09 SEPTIEMBRE/A.mp4");
      expect(dropbox).not.toBe(mock);
    });

    it("el mismo provider + mismo providerFileId SÍ produce la misma identidad (no es un cambio de comportamiento dentro de un mismo provider)", () => {
      const a = deriveIdentityKey("dropbox", "id:ABC", "/A.mp4");
      const b = deriveIdentityKey("dropbox", "id:ABC", "/B-renombrado.mp4");
      expect(a).toBe(b);
    });
  });
});
