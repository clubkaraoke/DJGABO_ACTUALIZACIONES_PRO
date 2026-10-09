import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { buildTestApp } from "./testApp.js";
import { CoverEnrichmentService } from "../src/services/CoverEnrichmentService.js";
import { karaokes } from "../src/db/schema.js";
import { createId } from "../src/db/id.js";

const BAD = "https://cdn-images.dzcdn.net/images/cover/29ce0d1b9aafaf5e4664fe2ff7b18abe/1000x1000-000000-80-0-0.jpg";
const GOOD = "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/6a/44/b8/6a44b849-3a02-c2ea-9f34-f6c52c04bdfd/26UM1IM04488.rgb.jpg/600x600bb.jpg";
describe("Persistent cover audit and repair", () => {
  let app: FastifyInstance;
  let tmp = "";
  beforeAll(async () => { ({ app } = await buildTestApp()); tmp = await mkdtemp(join(tmpdir(), "djgabo-covers-")); });
  afterAll(async () => { await app.close(); await rm(tmp, { recursive: true, force: true }); });

  async function seedCover(id: string, artist: string, url: string, title = "Almohada Karaoke (Coro)") {
    await app.db.insert(karaokes).values({
      id, title, artist, code: id.slice(0, 12), identityKey: id,
      collectionId: (await app.db.query.collections.findFirst())!.id,
      masterAssetId: null, previewAssetId: null, coverUrl: url, createdAt: new Date(),
    });
  }
  it("removes an automatic artist mismatch, keeps a manually changed URL and rematches the known Majo cover", async () => {
    const majoId = createId("kar"); const wrongId = createId("kar"); const manualId = createId("kar");
    await seedCover(majoId, "Majo Aguilar", BAD);
    await seedCover(wrongId, "Majo Aguilar", "https://example.org/wrong.jpg", "Mi Almohada Karaoke");
    await seedCover(manualId, "Majo Aguilar", "https://example.org/manually-fixed.jpg", "Mi Almohada Karaoke");
    const keyMajo = "majo aguilar::almohada";
    const keyOther = "majo aguilar::mi almohada";
    const old = { status: "MATCHED", provider: "deezer", coverUrl: "https://example.org/wrong.jpg", score: 1, checkedAt: new Date().toISOString(), retryAfter: null, providerArtist: "José José", providerTitle: "Mi Almohada" };
    await writeFile(join(tmp,"cover-provider-cache.json"), JSON.stringify({
      version: 3, updatedAt: new Date().toISOString(), entries: {
        [keyMajo]: { ...old, coverUrl: BAD, providerTitle: "Almohada" },
        [keyOther]: old,
      },
    }));
    const service = new CoverEnrichmentService(app.db, tmp);
    (service as unknown as { resolveCover: (artist:string,title:string)=>Promise<unknown> }).resolveCover =
      vi.fn().mockResolvedValue({ provider:"itunes",title:"Almohada",artist:"Majo Aguilar",coverUrl:GOOD,score:1 });
    const status = await service.auditExistingMatches();
    expect(status.invalidated).toBe(2);
    expect((await app.db.query.karaokes.findFirst({ where: eq(karaokes.id,majoId) }))?.coverUrl).toBe(GOOD);
    expect((await app.db.query.karaokes.findFirst({ where: eq(karaokes.id,wrongId) }))?.coverUrl).toBeNull();
    expect((await app.db.query.karaokes.findFirst({ where: eq(karaokes.id,manualId) }))?.coverUrl).toBe("https://example.org/manually-fixed.jpg");
    const next = JSON.parse(await readFile(join(tmp,"cover-provider-cache.json"),"utf8"));
    expect(next.artistMatchingAuditVersion).toBe(1);
    expect(next.entries[keyMajo].providerArtist).toBe("Majo Aguilar");
    expect(next.entries[keyOther]).toBeUndefined();
    expect((await service.auditExistingMatches()).examined).toBe(0);
  });
});
