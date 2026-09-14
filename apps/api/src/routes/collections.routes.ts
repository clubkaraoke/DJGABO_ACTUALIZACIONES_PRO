import type { FastifyInstance } from "fastify";
import { eq, desc, asc, count } from "drizzle-orm";
import type { CollectionSummaryDTO, CollectionDetailDTO, KaraokeSummaryDTO, ArchiveStatusDTO } from "@djgabo/shared";
import { getAccessibleCollectionIds } from "../services/accessibleCollections.js";
import { deriveSourceGroup } from "../services/sourceGroup.js";
import { collections, karaokes } from "../db/schema.js";

function toSummaryDTO(
  c: {
    id: string;
    slug: string;
    title: string;
    year: number;
    month: number;
    description: string | null;
    coverUrl: string | null;
    updatedAt: Date;
    publishedAt: Date | null;
  },
  karaokeCount: number,
  locked: boolean,
): CollectionSummaryDTO {
  return {
    id: c.id,
    slug: c.slug,
    title: c.title,
    year: c.year,
    month: c.month,
    description: c.description,
    coverUrl: c.coverUrl,
    karaokeCount,
    updatedAt: c.updatedAt.toISOString(),
    publishedAt: c.publishedAt?.toISOString() ?? null,
    locked,
  };
}

interface MasterAssetForDTO {
  storageKey: string;
  fileName: string;
  size: number;
}

function formatFromFileName(fileName: string | undefined): string | null {
  if (!fileName) return null;
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? null : fileName.slice(dot + 1).toUpperCase();
}

export function toKaraokeDTO(
  k: {
    id: string;
    title: string;
    artist: string;
    code: string;
    genre: string | null;
    year: number | null;
    format: string | null;
    size: number | null;
    coverUrl: string | null;
    collectionId: string;
    masterAssetId: string | null;
    previewAssetId: string | null;
    publishedAt: Date | null;
  },
  masterAsset?: MasterAssetForDTO | null,
  collectionStoragePath?: string,
): KaraokeSummaryDTO {
  return {
    id: k.id,
    title: k.title,
    artist: k.artist,
    code: k.code,
    genre: k.genre,
    year: k.year,
    format: k.format ?? formatFromFileName(masterAsset?.fileName),
    size: k.size ?? masterAsset?.size ?? null,
    coverUrl: k.coverUrl,
    collectionId: k.collectionId,
    hasPreview: Boolean(k.previewAssetId),
    hasMaster: Boolean(k.masterAssetId),
    publishedAt: k.publishedAt?.toISOString() ?? null,
    sourceGroup:
      masterAsset && collectionStoragePath
        ? deriveSourceGroup(masterAsset.storageKey, collectionStoragePath)
        : null,
  };
}

export async function registerCollectionsRoutes(fastify: FastifyInstance) {
  const { db } = fastify;

  fastify.get("/api/collections", { preHandler: fastify.authenticate }, async (request, reply) => {
    const { sub: userId, role } = request.authUser!;
    const accessibleIds = new Set(await getAccessibleCollectionIds(db, userId, role));

    const activeCollections = await db.query.collections.findMany({
      where: eq(collections.active, true),
      orderBy: [desc(collections.year), desc(collections.month), asc(collections.sortOrder)],
    });

    const dto: CollectionSummaryDTO[] = [];
    for (const c of activeCollections) {
      const [row] = await db.select({ value: count() }).from(karaokes).where(eq(karaokes.collectionId, c.id));
      dto.push(toSummaryDTO(c, row?.value ?? 0, !accessibleIds.has(c.id)));
    }
    return reply.send(dto);
  });

  fastify.get<{ Params: { id: string } }>(
    "/api/collections/:id",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const { sub: userId } = request.authUser!;
      const { id } = request.params;

      const check = await fastify.authorizationService.canAccessCollection(userId, id);
      if (!check.allowed) {
        return reply.code(403).send({ error: check.reason ?? "FORBIDDEN", message: "No tienes acceso a esta colección", statusCode: 403 });
      }

      const collection = await db.query.collections.findFirst({ where: eq(collections.id, id) });
      if (!collection) {
        return reply.code(404).send({ error: "COLLECTION_NOT_FOUND", message: "Colección no encontrada", statusCode: 404 });
      }
      const collectionKaraokes = await db.query.karaokes.findMany({
        where: eq(karaokes.collectionId, id),
        orderBy: asc(karaokes.title),
        with: { masterAsset: true },
      });

      const dto: CollectionDetailDTO = {
        collection: toSummaryDTO(collection, collectionKaraokes.length, false),
        karaokes: collectionKaraokes.map((karaoke) =>
          toKaraokeDTO(karaoke, karaoke.masterAsset, collection.storagePath),
        ),
      };
      return reply.send(dto);
    },
  );

  /**
   * Consultado bajo demanda (no en el listado general) para no multiplicar
   * llamadas al StorageProvider en cada carga del home — el cliente lo pide
   * solo cuando el usuario abre el modal de "Descargar todo".
   */
  fastify.get<{ Params: { id: string } }>(
    "/api/collections/:id/archive-status",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const { sub: userId } = request.authUser!;
      const { id } = request.params;

      const check = await fastify.authorizationService.canAccessCollection(userId, id);
      if (!check.allowed) {
        return reply.code(403).send({ error: check.reason ?? "FORBIDDEN", message: "No tienes acceso a esta colección", statusCode: 403 });
      }

      const collection = await db.query.collections.findFirst({ where: eq(collections.id, id) });
      if (!collection) {
        return reply.code(404).send({ error: "COLLECTION_NOT_FOUND", message: "Colección no encontrada", statusCode: 404 });
      }

      const status = await fastify.storageService.getArchiveStatus(collection.slug);
      const dto: ArchiveStatusDTO = status;
      return reply.send(dto);
    },
  );
}
