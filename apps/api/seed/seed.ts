import "dotenv/config";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { deriveCodeFromKey, deriveIdentityKey } from "@djgabo/storage";
import { createDb } from "../src/db/client.js";
import { createId } from "../src/db/id.js";
import { plans, users, collections, assets, karaokes, userCollectionAccess, deviceSessions, downloadLogs } from "../src/db/schema.js";
import { ARTISTS, TITLES, GENRES, SEED_MONTHS, buildStorageKey, monthFolderName } from "./seedData.js";

const db = createDb(process.env.DATABASE_URL ?? "file:./data/dev.db");
const COVER_BASE = "https://picsum.photos/seed";

async function upsertPlan(slug: string, data: { name: string; description: string; maxDevices: number }) {
  const existing = await db.query.plans.findFirst({ where: eq(plans.slug, slug) });
  if (existing) return existing;
  const now = new Date();
  const id = createId("plan");
  await db.insert(plans).values({ id, slug, ...data, createdAt: now, updatedAt: now });
  return db.query.plans.findFirst({ where: eq(plans.id, id) });
}

async function upsertUser(email: string, data: {
  name: string;
  role: "ADMIN" | "MEMBER";
  status: "ACTIVE" | "SUSPENDED" | "EXPIRED";
  passwordHash: string;
  planId?: string | null;
  subscriptionStart?: Date | null;
  subscriptionEnd?: Date | null;
  maxDevices: number;
}) {
  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (existing) return existing;
  const now = new Date();
  const id = createId("usr");
  await db.insert(users).values({ id, email, createdAt: now, updatedAt: now, ...data });
  return db.query.users.findFirst({ where: eq(users.id, id) });
}

async function main() {
  console.log("🌱 Sembrando DJGABO ACTUALIZACIONES PRO...");

  // ---------- Planes ----------
  const planBasico = await upsertPlan("basico", { name: "Básico", description: "Acceso al mes en curso", maxDevices: 1 });
  const planProMensual = await upsertPlan("pro-mensual", { name: "Pro Mensual", description: "Acceso a los últimos 6 meses", maxDevices: 2 });
  const planProAnual = await upsertPlan("pro-anual", { name: "Pro Anual", description: "Acceso completo al catálogo", maxDevices: 3 });

  // ---------- Usuarios ----------
  const passwordHash = await bcrypt.hash("Djgabo2026!", 12);

  await upsertUser("admin@djgabo.com", {
    name: "Augusto (Admin)", role: "ADMIN", status: "ACTIVE", passwordHash, maxDevices: 10,
  });
  const carlos = await upsertUser("carlos@demo.com", {
    name: "Carlos Pérez", role: "MEMBER", status: "ACTIVE", passwordHash,
    planId: planProAnual!.id, subscriptionStart: new Date("2026-03-13"), subscriptionEnd: new Date("2027-03-13"), maxDevices: 3,
  });
  const maria = await upsertUser("maria@demo.com", {
    name: "María Torres", role: "MEMBER", status: "ACTIVE", passwordHash,
    planId: planBasico!.id, subscriptionStart: new Date("2026-09-01"), subscriptionEnd: new Date("2026-10-01"), maxDevices: 1,
  });
  const jose = await upsertUser("jose@demo.com", {
    name: "José Ramírez", role: "MEMBER", status: "SUSPENDED", passwordHash,
    planId: planProMensual!.id, subscriptionStart: new Date("2026-06-01"), subscriptionEnd: new Date("2026-12-01"), maxDevices: 2,
  });
  const ana = await upsertUser("ana@demo.com", {
    // vencida por fecha aunque el status diga ACTIVE: demuestra la regla de doble verificación
    name: "Ana Quispe", role: "MEMBER", status: "ACTIVE", passwordHash,
    planId: planProMensual!.id, subscriptionStart: new Date("2026-02-01"), subscriptionEnd: new Date("2026-08-01"), maxDevices: 2,
  });
  const luis = await upsertUser("luis@demo.com", {
    name: "Luis Fernández", role: "MEMBER", status: "ACTIVE", passwordHash,
    planId: planProAnual!.id, subscriptionStart: new Date("2026-01-01"), subscriptionEnd: new Date("2027-01-01"), maxDevices: 2,
  });

  // ---------- Colecciones + Karaokes ----------
  const collectionIds: string[] = [];
  let artistCursor = 0;
  let titleCursor = 0;

  for (let i = 0; i < SEED_MONTHS.length; i++) {
    const { year, month } = SEED_MONTHS[i]!;
    const slug = `${year}-${String(month).padStart(2, "0")}`;
    const storagePath = `/ACTUALIZACIONES/${year}/${monthFolderName(month)}`;

    let collection = await db.query.collections.findFirst({ where: eq(collections.slug, slug) });
    if (!collection) {
      const id = createId("col");
      const now = new Date();
      const title = monthFolderName(month).split(" ").slice(1).join(" ");
      const titleCased = title.charAt(0) + title.slice(1).toLowerCase();
      await db.insert(collections).values({
        id, slug, title: `${titleCased} ${year}`, year, month, storagePath,
        coverUrl: `${COVER_BASE}/djgabo-${slug}/600/400`,
        publishedAt: new Date(year, month - 1, 5),
        updatedAt: now, createdAt: now, sortOrder: i, active: true,
      });
      collection = await db.query.collections.findFirst({ where: eq(collections.id, id) });
    }
    collectionIds.push(collection!.id);

    const karaokeCount = 9; // 12 meses x 9 = 108 karaokes (>= 100 requerido)
    for (let k = 0; k < karaokeCount; k++) {
      const artist = ARTISTS[artistCursor % ARTISTS.length]!;
      const title = `${TITLES[titleCursor % TITLES.length]}${k >= TITLES.length ? ` (Versión ${Math.floor(k / TITLES.length) + 1})` : ""}`;
      artistCursor++;
      titleCursor++;

      const masterKey = buildStorageKey(year, month, artist, title);
      // El seed corre sobre datos Mock sin providerFileId real, así que cae
      // al mismo fallback documentado que usaría el indexador real (SHA-256
      // del storageKey) — nunca el viejo hash de 32 bits para identidad.
      const identityKey = deriveIdentityKey("mock", undefined, masterKey);
      const code = deriveCodeFromKey(identityKey);
      const size = 35_000_000 + Math.floor(Math.random() * 40_000_000);

      let masterAsset = await db.query.assets.findFirst({ where: eq(assets.storageKey, masterKey) });
      if (!masterAsset) {
        const id = createId("ast");
        await db.insert(assets).values({
          id, storageKey: masterKey, fileName: masterKey.split("/").pop()!,
          size, mimeType: "video/mp4", provider: "mock", type: "MASTER", createdAt: new Date(),
        });
        masterAsset = await db.query.assets.findFirst({ where: eq(assets.id, id) });
      }

      // ~85% de los karaokes tienen preview; el resto demuestra ASSET_NOT_AVAILABLE.
      // Convención real (packages/storage/src/indexer/previewConvention.ts):
      // mismo nombre de archivo, en una subcarpeta _PREVIEWS del mismo mes.
      let previewAssetId: string | null = null;
      if (k % 7 !== 0) {
        const masterFileName = masterKey.split("/").pop()!;
        const masterDir = masterKey.slice(0, masterKey.lastIndexOf("/"));
        const previewKey = `${masterDir}/_PREVIEWS/${masterFileName}`;
        let previewAsset = await db.query.assets.findFirst({ where: eq(assets.storageKey, previewKey) });
        if (!previewAsset) {
          const id = createId("ast");
          await db.insert(assets).values({
            id, storageKey: previewKey, fileName: masterFileName,
            size: 3_000_000, mimeType: "video/mp4", provider: "mock", type: "PREVIEW", createdAt: new Date(),
          });
          previewAsset = await db.query.assets.findFirst({ where: eq(assets.id, id) });
        }
        previewAssetId = previewAsset!.id;
      }

      const existingKaraoke = await db.query.karaokes.findFirst({ where: eq(karaokes.identityKey, identityKey) });
      if (!existingKaraoke) {
        await db.insert(karaokes).values({
          id: createId("kar"),
          identityKey, code, title, artist,
          genre: GENRES[(artistCursor + titleCursor) % GENRES.length],
          year, format: "MP4", size,
          coverUrl: `${COVER_BASE}/${code}/300/300`,
          collectionId: collection!.id,
          masterAssetId: masterAsset!.id,
          previewAssetId,
          publishedAt: new Date(year, month - 1, 5),
          createdAt: new Date(),
        });
      }
    }
  }

  // ---------- Accesos por usuario (bloqueado vs permitido, punto 1) ----------
  async function grantAccess(userId: string, collectionId: string) {
    const existing = await db.query.userCollectionAccess.findFirst({
      where: (a, { and, eq }) => and(eq(a.userId, userId), eq(a.collectionId, collectionId)),
    });
    if (existing) return;
    await db.insert(userCollectionAccess).values({
      id: createId("access"), userId, collectionId, enabled: true, grantedAt: new Date(),
    });
  }

  const last6 = collectionIds.slice(-6);
  for (const collectionId of last6) {
    await grantAccess(carlos!.id, collectionId);
    await grantAccess(jose!.id, collectionId); // suspendido: el AuthorizationService lo bloquea igual
    await grantAccess(ana!.id, collectionId); // vencida por fecha: el AuthorizationService la bloquea igual
  }
  await grantAccess(maria!.id, collectionIds[collectionIds.length - 1]!);
  for (const collectionId of collectionIds) {
    await grantAccess(luis!.id, collectionId);
  }

  // ---------- Dispositivos (demuestra límite alcanzado para Luis) ----------
  async function upsertDevice(userId: string, deviceId: string, name: string) {
    const existing = await db.query.deviceSessions.findFirst({
      where: (d, { and, eq }) => and(eq(d.userId, userId), eq(d.deviceId, deviceId)),
    });
    if (existing) return;
    await db.insert(deviceSessions).values({ id: createId("dev"), userId, deviceId, name, active: true, lastSeenAt: new Date() });
  }
  await upsertDevice(luis!.id, "device-laptop-luis", "Laptop de Luis");
  await upsertDevice(luis!.id, "device-tv-luis", "TV del local");
  await upsertDevice(carlos!.id, "device-laptop-carlos", "Laptop de Carlos");

  // ---------- Logs de descarga de ejemplo (para el dashboard admin) ----------
  const someKaraokes = await db.query.karaokes.findMany({ limit: 15 });
  const now = Date.now();
  for (let i = 0; i < someKaraokes.length; i++) {
    const karaoke = someKaraokes[i]!;
    const hoursAgo = i < 5 ? i * 2 : i * 20;
    await db.insert(downloadLogs).values({
      id: createId("dl"),
      userId: i % 2 === 0 ? carlos!.id : luis!.id,
      karaokeId: karaoke.id,
      collectionId: karaoke.collectionId,
      assetId: karaoke.masterAssetId,
      type: "KARAOKE",
      deviceId: i % 2 === 0 ? "device-laptop-carlos" : "device-laptop-luis",
      createdAt: new Date(now - hoursAgo * 60 * 60 * 1000),
    });
  }

  console.log("✅ Seed completo.");
  console.log("   Admin:  admin@djgabo.com / Djgabo2026!");
  console.log("   Member: carlos@demo.com / Djgabo2026!  (PRO ANUAL, acceso a los últimos 6 meses)");
  console.log("   Member: maria@demo.com  / Djgabo2026!  (BÁSICO, solo Septiembre 2026)");
  console.log("   Member: jose@demo.com   / Djgabo2026!  (SUSPENDIDO)");
  console.log("   Member: ana@demo.com    / Djgabo2026!  (vencida por fecha, status ACTIVE)");
  console.log("   Member: luis@demo.com   / Djgabo2026!  (acceso total, 2/2 dispositivos)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
