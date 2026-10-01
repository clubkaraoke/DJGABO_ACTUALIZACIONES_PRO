import { and, count, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { assets, collections, karaokes } from "../db/schema.js";

/**
 * Índice ligero para la galería de Actualizaciones.
 * Solo devuelve colecciones que tienen al menos un karaoke real de Dropbox.
 * El detalle completo de cada mes sigue en /api/catalog/:year/:month/index.json.
 */
export async function registerCatalogIndexRoutes(fastify: FastifyInstance) {
  fastify.get("/api/catalog/index.json", async (_request, reply) => {
    const { doc: version } = await fastify.catalogJsonService.readVersion();

    const rows = await fastify.db
      .select({
        year: collections.year,
        month: collections.month,
        slug: collections.slug,
        title: collections.title,
        coverUrl: collections.coverUrl,
        active: collections.active,
        total: count(assets.id),
      })
      .from(collections)
      .leftJoin(karaokes, eq(karaokes.collectionId, collections.id))
      .leftJoin(
        assets,
        and(
          eq(karaokes.masterAssetId, assets.id),
          eq(assets.provider, "dropbox"),
        ),
      )
      .groupBy(
        collections.id,
        collections.year,
        collections.month,
        collections.slug,
        collections.title,
        collections.coverUrl,
        collections.active,
      )
      .orderBy(desc(collections.year), desc(collections.month));

    const visible = rows
      .map((row) => ({
        year: row.year,
        month: row.month,
        slug: row.slug,
        title: row.title,
        cover_url: row.coverUrl,
        active: row.active,
        total: Number(row.total),
      }))
      .filter((row) => row.total > 0);

    reply.header("Cache-Control", "public, max-age=10, stale-while-revalidate=30");
    return reply.send({
      schema_version: 1,
      version: version.version,
      updated_at: version.updated_at,
      collections: visible,
    });
  });
}
