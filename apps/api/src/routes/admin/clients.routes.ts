import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, count, desc } from "drizzle-orm";
import type { AdminClientRowDTO } from "@djgabo/shared";
import { users, plans, deviceSessions, userCollectionAccess } from "../../db/schema.js";
import { createId } from "../../db/id.js";

const updateClientSchema = z.object({
  status: z.enum(["ACTIVE", "EXPIRED", "SUSPENDED"]).optional(),
  planId: z.string().nullable().optional(),
  subscriptionStart: z.string().datetime().nullable().optional(),
  subscriptionEnd: z.string().datetime().nullable().optional(),
  maxDevices: z.number().int().min(1).max(20).optional(),
});

const accessSchema = z.object({
  collectionId: z.string().min(1),
  enabled: z.boolean(),
  expiresAt: z.string().datetime().nullable().optional(),
});

export async function registerAdminClientsRoutes(fastify: FastifyInstance) {
  const { db } = fastify;
  const guard = { preHandler: [fastify.authenticate, fastify.requireRole("ADMIN")] };

  fastify.get("/api/admin/clients", guard, async (_request, reply) => {
    const memberUsers = await db.query.users.findMany({
      where: eq(users.role, "MEMBER"),
      orderBy: desc(users.createdAt),
    });

    const rows: AdminClientRowDTO[] = [];
    for (const u of memberUsers) {
      const plan = u.planId ? await db.query.plans.findFirst({ where: eq(plans.id, u.planId) }) : null;
      const migration = await fastify.vipMigrationService.findByUserId(u.id);
      const [devicesRow] = await db
        .select({ value: count() })
        .from(deviceSessions)
        .where(and(eq(deviceSessions.userId, u.id), eq(deviceSessions.active, true)));
      const [accessRow] = await db
        .select({ value: count() })
        .from(userCollectionAccess)
        .where(and(eq(userCollectionAccess.userId, u.id), eq(userCollectionAccess.enabled, true)));

      rows.push({
        id: u.id,
        name: u.name,
        email: u.email,
        whatsapp: migration?.whatsapp ?? null,
        activationPending: Boolean(migration && !u.planId),
        plan: plan?.name ?? null,
        status: u.status as AdminClientRowDTO["status"],
        subscriptionStart: u.subscriptionStart?.toISOString() ?? null,
        subscriptionEnd: u.subscriptionEnd?.toISOString() ?? null,
        devicesUsed: devicesRow?.value ?? 0,
        maxDevices: u.maxDevices,
        accessibleCollections: accessRow?.value ?? 0,
      });
    }
    return reply.send(rows);
  });

  fastify.get<{ Params: { id: string } }>("/api/admin/clients/:id", guard, async (request, reply) => {
    const user = await db.query.users.findFirst({ where: eq(users.id, request.params.id) });
    if (!user) return reply.code(404).send({ error: "NOT_FOUND", message: "Cliente no encontrado", statusCode: 404 });

    const migration = await fastify.vipMigrationService.findByUserId(user.id);
    const allCollections = await db.query.collections.findMany({
      orderBy: (c, { desc }) => [desc(c.year), desc(c.month)],
    });
    const accesses = await db.query.userCollectionAccess.findMany({
      where: eq(userCollectionAccess.userId, user.id),
    });
    const accessByCollection = new Map(accesses.map((a) => [a.collectionId, a]));

    const devices = await db.query.deviceSessions.findMany({
      where: eq(deviceSessions.userId, user.id),
      orderBy: (d, { desc }) => desc(d.lastSeenAt),
    });

    return reply.send({
      id: user.id,
      name: user.name,
      email: user.email,
      whatsapp: migration?.whatsapp ?? null,
      activationPending: Boolean(migration && !user.planId),
      status: user.status,
      planId: user.planId,
      subscriptionStart: user.subscriptionStart?.toISOString() ?? null,
      subscriptionEnd: user.subscriptionEnd?.toISOString() ?? null,
      maxDevices: user.maxDevices,
      collections: allCollections.map((c) => ({
        id: c.id,
        title: c.title,
        enabled: accessByCollection.get(c.id)?.enabled ?? false,
        expiresAt: accessByCollection.get(c.id)?.expiresAt?.toISOString() ?? null,
      })),
      devices: devices.map((d) => ({
        id: d.id,
        name: d.name,
        lastSeenAt: d.lastSeenAt.toISOString(),
        active: d.active,
      })),
    });
  });

  fastify.patch<{ Params: { id: string } }>("/api/admin/clients/:id", guard, async (request, reply) => {
    const parsed = updateClientSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "INVALID_INPUT", message: "Datos inválidos", statusCode: 400 });
    }
    const { subscriptionStart, subscriptionEnd, ...rest } = parsed.data;
    await db
      .update(users)
      .set({
        ...rest,
        ...(subscriptionStart !== undefined ? { subscriptionStart: subscriptionStart ? new Date(subscriptionStart) : null } : {}),
        ...(subscriptionEnd !== undefined ? { subscriptionEnd: subscriptionEnd ? new Date(subscriptionEnd) : null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, request.params.id));
    const updated = await db.query.users.findFirst({ where: eq(users.id, request.params.id) });
    return reply.send({ id: updated?.id, status: updated?.status });
  });

  fastify.post<{ Params: { id: string } }>("/api/admin/clients/:id/access", guard, async (request, reply) => {
    const parsed = accessSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "INVALID_INPUT", message: "Datos de acceso inválidos", statusCode: 400 });
    }
    const { collectionId, enabled, expiresAt } = parsed.data;
    const existing = await db.query.userCollectionAccess.findFirst({
      where: and(eq(userCollectionAccess.userId, request.params.id), eq(userCollectionAccess.collectionId, collectionId)),
    });
    if (existing) {
      await db
        .update(userCollectionAccess)
        .set({ enabled, expiresAt: expiresAt ? new Date(expiresAt) : null })
        .where(eq(userCollectionAccess.id, existing.id));
    } else {
      await db.insert(userCollectionAccess).values({
        id: createId("access"),
        userId: request.params.id,
        collectionId,
        enabled,
        grantedAt: new Date(),
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      });
    }
    return reply.code(204).send();
  });

  fastify.post<{ Params: { userId: string; sessionId: string } }>(
    "/api/admin/clients/:userId/devices/:sessionId/deactivate",
    guard,
    async (request, reply) => {
      const { userId, sessionId } = request.params;
      const session = await db.query.deviceSessions.findFirst({
        where: and(eq(deviceSessions.id, sessionId), eq(deviceSessions.userId, userId)),
      });
      if (!session) {
        return reply.code(404).send({ error: "NOT_FOUND", message: "Dispositivo no encontrado", statusCode: 404 });
      }
      await db.update(deviceSessions).set({ active: false }).where(eq(deviceSessions.id, sessionId));
      return reply.code(204).send();
    },
  );
}
