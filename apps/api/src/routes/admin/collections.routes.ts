import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, desc, count } from "drizzle-orm";
import { collections, karaokes } from "../../db/schema.js";
import { createId } from "../../db/id.js";

const createSchema = z.object({
  title: z.string().min(1),
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  description: z.string().optional(),
  coverUrl: z.string().url().optional(),
  storagePath: z.string().min(1),
  sortOrder: z.number().int().default(0),
});

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  coverUrl: z.string().url().nullable().optional(),
  active: z.boolean().optional(),
  storagePath: z.string().min(1).optional(),
  sortOrder: z.number().int().optional(),
});

export async function registerAdminCollectionsRoutes(fastify: FastifyInstance) {
  const { db } = fastify;
  const guard = { preHandler: [fastify.authenticate, fastify.requireRole("ADMIN")] };

  fastify.get("/api/admin/collections", guard, async (_request, reply) => {
    const allCollections = await db.query.collections.findMany({
      orderBy: [desc(collections.year), desc(collections.month)],
    });
    const result = [];
    for (const c of allCollections) {
      const [row] = await db.select({ value: count() }).from(karaokes).where(eq(karaokes.collectionId, c.id));
      const archiveStatus = await fastify.storageService.getArchiveStatus(c.slug);
      result.push({
        id: c.id,
        slug: c.slug,
        title: c.title,
        year: c.year,
        month: c.month,
        active: c.active,
        coverUrl: c.coverUrl,
        storagePath: c.storagePath,
        karaokeCount: row?.value ?? 0,
        updatedAt: c.updatedAt.toISOString(),
        archiveAvailable: archiveStatus.available,
        archiveSize: archiveStatus.size ?? null,
      });
    }
    return reply.send(result);
  });

  fastify.post("/api/admin/collections", guard, async (request, reply) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "INVALID_INPUT", message: "Datos de colección inválidos", statusCode: 400 });
    }
    const d = parsed.data;
    const id = createId("col");
    const now = new Date();
    await db.insert(collections).values({
      id,
      title: d.title,
      year: d.year,
      month: d.month,
      description: d.description,
      coverUrl: d.coverUrl,
      storagePath: d.storagePath,
      sortOrder: d.sortOrder,
      slug: `${d.year}-${String(d.month).padStart(2, "0")}`,
      publishedAt: now,
      updatedAt: now,
      createdAt: now,
    });
    const collection = await db.query.collections.findFirst({ where: eq(collections.id, id) });
    return reply.code(201).send(collection);
  });

  fastify.patch<{ Params: { id: string } }>("/api/admin/collections/:id", guard, async (request, reply) => {
    const parsed = updateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "INVALID_INPUT", message: "Datos de colección inválidos", statusCode: 400 });
    }
    await db.update(collections).set({ ...parsed.data, updatedAt: new Date() }).where(eq(collections.id, request.params.id));
    const collection = await db.query.collections.findFirst({ where: eq(collections.id, request.params.id) });
    return reply.send(collection);
  });
}
