import { describe, it, expect } from "vitest";
import { loadTestDb } from "./testApp.js";
import { assets } from "../src/db/schema.js";
import { createId } from "../src/db/id.js";

function baseAsset(overrides: Partial<typeof assets.$inferInsert>) {
  return {
    id: createId("ast"),
    storageKey: `/x-${createId("sk")}.mp4`,
    fileName: "x.mp4",
    size: 1,
    mimeType: "video/mp4",
    type: "MASTER",
    createdAt: new Date(),
    ...overrides,
  } satisfies typeof assets.$inferInsert;
}

describe("Constraint UNIQUE(provider, providerFileId) en assets (punto 2)", () => {
  it("rechaza dos assets con el mismo (provider, providerFileId)", async () => {
    const db = loadTestDb();
    await db.insert(assets).values(baseAsset({ provider: "dropbox", providerFileId: "id:ABC123", storageKey: "/a.mp4" }));

    let caught: unknown;
    try {
      await db.insert(assets).values(baseAsset({ provider: "dropbox", providerFileId: "id:ABC123", storageKey: "/b.mp4" }));
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeTruthy();
  });

  it("permite múltiples assets con providerFileId NULL (providers sin ID estable, ej. Mock)", async () => {
    const db = loadTestDb();
    await db.insert(assets).values(baseAsset({ provider: "mock", providerFileId: null, storageKey: "/a.mp4" }));

    let caught: unknown;
    try {
      await db.insert(assets).values(baseAsset({ provider: "mock", providerFileId: null, storageKey: "/b.mp4" }));
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeUndefined(); // no debe fallar: NULL nunca "choca" con otro NULL
  });

  it("el mismo providerFileId en providers DISTINTOS no colisiona (el constraint es compuesto, no solo sobre providerFileId)", async () => {
    const db = loadTestDb();
    await db.insert(assets).values(baseAsset({ provider: "dropbox", providerFileId: "id:MISMO", storageKey: "/a.mp4" }));

    let caught: unknown;
    try {
      await db.insert(assets).values(baseAsset({ provider: "mock", providerFileId: "id:MISMO", storageKey: "/b.mp4" }));
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeUndefined();
  });
});

describe("Constraint UNIQUE(provider, storageKey) en assets (punto 2 de esta pasada)", () => {
  it("rechaza dos assets del MISMO provider con el mismo storageKey", async () => {
    const db = loadTestDb();
    await db.insert(assets).values(baseAsset({ provider: "mock", storageKey: "/ACTUALIZACIONES/2026/09 SEPTIEMBRE/A.mp4" }));

    let caught: unknown;
    try {
      await db.insert(assets).values(baseAsset({ provider: "mock", storageKey: "/ACTUALIZACIONES/2026/09 SEPTIEMBRE/A.mp4" }));
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeTruthy();
  });

  it("el mismo storageKey en providers DISTINTOS no colisiona", async () => {
    const db = loadTestDb();
    await db.insert(assets).values(baseAsset({ provider: "mock", storageKey: "/ACTUALIZACIONES/2026/09 SEPTIEMBRE/A.mp4" }));

    let caught: unknown;
    try {
      await db.insert(assets).values(
        baseAsset({ provider: "dropbox", providerFileId: "id:ABC", storageKey: "/ACTUALIZACIONES/2026/09 SEPTIEMBRE/A.mp4" }),
      );
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeUndefined();
  });

  it("caso crítico: un Asset Mock ya existente y una sincronización de Dropbox con el MISMO storageKey coexisten como dos Assets independientes, sin constraint error", async () => {
    const db = loadTestDb();
    const SAME_PATH = "/ACTUALIZACIONES/2026/09 SEPTIEMBRE/A.mp4";

    // 1) Ya existe un Asset de Mock en ese path (por ejemplo, de una demo anterior).
    const mockId = createId("ast");
    await db.insert(assets).values(
      baseAsset({ id: mockId, provider: "mock", providerFileId: null, storageKey: SAME_PATH }),
    );

    // 2) Se sincroniza Dropbox: mismo storageKey, su propio providerFileId.
    const dropboxId = createId("ast");
    let caught: unknown;
    try {
      await db.insert(assets).values(
        baseAsset({ id: dropboxId, provider: "dropbox", providerFileId: "id:ABC", storageKey: SAME_PATH }),
      );
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeUndefined(); // sin constraint error

    const rows = await db.query.assets.findMany();
    expect(rows).toHaveLength(2); // dos Assets independientes
    const mockRow = rows.find((r) => r.provider === "mock")!;
    const dropboxRow = rows.find((r) => r.provider === "dropbox")!;
    expect(mockRow.storageKey).toBe(SAME_PATH);
    expect(dropboxRow.storageKey).toBe(SAME_PATH);
    expect(mockRow.id).not.toBe(dropboxRow.id);
  });
});
