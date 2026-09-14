import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, or, like, eq, inArray, desc, asc } from "drizzle-orm";
import { getAccessibleCollectionIds } from "../services/accessibleCollections.js";
import { toKaraokeDTO } from "./collections.routes.js";
import { karaokes } from "../db/schema.js";

const querySchema = z.object({
  q: z.string().trim().optional(),
  collectionId: z.string().optional(),
  genre: z.string().optional(),
  year: z.coerce.number().optional(),
  sort: z.enum(["title", "artist", "recent"]).optional(),
});

/**
 * Búsqueda instantánea por título, artista, código, género, año o colección
 * (punto 15). SIEMPRE se filtra primero por colecciones accesibles: nunca se
 * confía en que el frontend solo pida colecciones permitidas.
 */
export async function registerKaraokesRoutes(fastify: FastifyInstance) {
  const { db } = fastify;

  fastify.get("/api/karaokes/search", { preHandler: fastify.authenticate }, async (request, reply) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "INVALID_INPUT", message: "Parámetros de búsqueda inválidos", statusCode: 400 });
    }
    const { q, collectionId, genre, year, sort } = parsed.data;
    const { sub: userId, role } = request.authUser!;

    const accessibleIds = await getAccessibleCollectionIds(db, userId, role);
    if (accessibleIds.length === 0) return reply.send([]);

    const collectionFilter = collectionId
      ? accessibleIds.includes(collectionId)
        ? [collectionId]
        : [] // pidió una colección a la que no tiene acceso: resultado vacío, nunca fuga
      : accessibleIds;

    if (collectionFilter.length === 0) return reply.send([]);

    const conditions = [inArray(karaokes.collectionId, collectionFilter)];
    if (genre) conditions.push(eq(karaokes.genre, genre));
    if (year) conditions.push(eq(karaokes.year, year));
    if (q) {
      const term = `%${q}%`;
      conditions.push(
        or(like(karaokes.title, term), like(karaokes.artist, term), like(karaokes.code, term))!,
      );
    }

    const orderBy =
      sort === "artist" ? asc(karaokes.artist) : sort === "recent" ? desc(karaokes.createdAt) : asc(karaokes.title);

    const results = await db.query.karaokes.findMany({
      where: and(...conditions),
      orderBy,
      limit: 200,
    });

    return reply.send(results.map(toKaraokeDTO));
  });
}
