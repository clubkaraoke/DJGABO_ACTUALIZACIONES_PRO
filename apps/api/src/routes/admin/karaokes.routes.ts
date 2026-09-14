import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, or, like, eq, count } from "drizzle-orm";
import { karaokes, collections, assets } from "../../db/schema.js";
import { deriveSourceGroup, prettifySourceGroup } from "../../services/sourceGroup.js";

const querySchema = z.object({
  q: z.string().optional(),
  collectionId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  artist: z.string().min(1).optional(),
  genre: z.string().nullable().optional(),
  year: z.number().int().nullable().optional(),
  coverUrl: z.string().url().nullable().optional(),
});

export async function registerAdminKaraokesRoutes(fastify: FastifyInstance) {
  const { db } = fastify;
  const guard = { preHandler: [fastify.authenticate, fastify.requireRole("ADMIN")] };

  fastify.get("/api/admin/karaokes", guard, async (request, reply) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "INVALID_INPUT", message: "Parámetros inválidos", statusCode: 400 });
    }
    const { q, collectionId, page, pageSize } = parsed.data;

    const conditions = [];
    if (collectionId) conditions.push(eq(karaokes.collectionId, collectionId));
    if (q) {
      const term = `%${q}%`;
      conditions.push(or(like(karaokes.title, term), like(karaokes.artist, term), like(karaokes.code, term))!);
    }
    const where = conditions.length ? and(...conditions) : undefined;

    const [totalRow] = await db.select({ value: count() }).from(karaokes).where(where);
    const items = await db.query.karaokes.findMany({
      where,
      orderBy: (k, { desc }) => desc(k.createdAt),
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });

    const rows = [];
    for (const k of items) {
      const collection = await db.query.collections.findFirst({ where: eq(collections.id, k.collectionId) });
      const masterAsset = k.masterAssetId ? await db.query.assets.findFirst({ where: eq(assets.id, k.masterAssetId) }) : null;
      const previewAsset = k.previewAssetId ? await db.query.assets.findFirst({ where: eq(assets.id, k.previewAssetId) }) : null;
      const sourceGroup = masterAsset && collection
        ? deriveSourceGroup(masterAsset.storageKey, collection.storagePath)
        : null;

      rows.push({
        id: k.id,
        title: k.title,
        artist: k.artist,
        code: k.code,
        genre: k.genre,
        year: k.year,
        format: k.format ?? (masterAsset?.fileName.includes(".") ? masterAsset.fileName.split(".").pop()?.toUpperCase() ?? null : null),
        size: k.size ?? masterAsset?.size ?? null,
        coverUrl: k.coverUrl,
        collectionTitle: collection?.title ?? "—",
        collectionId: k.collectionId,
        collectionSlug: collection?.slug ?? null,
        collectionStoragePath: collection?.storagePath ?? null,
        storageStatus: masterAsset ? "DISPONIBLE" : "FALTANTE",
        previewStatus: previewAsset ? "DISPONIBLE" : "FALTANTE",
        masterAsset: masterAsset
          ? {
              provider: masterAsset.provider,
              storageKey: masterAsset.storageKey,
              fileName: masterAsset.fileName,
              mimeType: masterAsset.mimeType,
              size: masterAsset.size,
              providerFileIdPresent: Boolean(masterAsset.providerFileId),
              sourceGroup: sourceGroup ? prettifySourceGroup(sourceGroup) : null,
            }
          : null,
      });
    }

    return reply.send({ total: totalRow?.value ?? 0, page, pageSize, items: rows });
  });

  fastify.patch<{ Params: { id: string } }>("/api/admin/karaokes/:id", guard, async (request, reply) => {
    const parsed = updateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "INVALID_INPUT", message: "Datos inválidos", statusCode: 400 });
    }
    await db.update(karaokes).set(parsed.data).where(eq(karaokes.id, request.params.id));
    const karaoke = await db.query.karaokes.findFirst({ where: eq(karaokes.id, request.params.id) });
    return reply.send(karaoke);
  });
}
