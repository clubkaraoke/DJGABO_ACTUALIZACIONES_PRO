import type { FastifyInstance } from "fastify";
import { eq, and, gte, isNotNull, count, desc } from "drizzle-orm";
import type { AdminDashboardStatsDTO } from "@djgabo/shared";
import { downloadLogs, users, karaokes, collections } from "../../db/schema.js";

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  const day = x.getDay();
  const diff = (day + 6) % 7; // semana empieza lunes
  x.setDate(x.getDate() - diff);
  return x;
}

export async function registerAdminDownloadsRoutes(fastify: FastifyInstance) {
  const { db } = fastify;
  const guard = { preHandler: [fastify.authenticate, fastify.requireRole("ADMIN")] };

  fastify.get("/api/admin/downloads", guard, async (request, reply) => {
    const page = Number((request.query as { page?: string }).page ?? 1);
    const pageSize = 50;

    const [totalRow] = await db.select({ value: count() }).from(downloadLogs);
    const logs = await db.query.downloadLogs.findMany({
      orderBy: desc(downloadLogs.createdAt),
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    const items = [];
    for (const l of logs) {
      const user = await db.query.users.findFirst({ where: eq(users.id, l.userId) });
      items.push({
        id: l.id,
        userId: l.userId,
        userName: user?.name ?? "—",
        karaokeId: l.karaokeId,
        collectionId: l.collectionId,
        type: l.type,
        createdAt: l.createdAt.toISOString(),
      });
    }
    return reply.send({ total: totalRow?.value ?? 0, page, items });
  });

  fastify.get("/api/admin/dashboard", guard, async (_request, reply) => {
    const now = new Date();
    const today = startOfDay(now);
    const weekStart = startOfWeek(now);

    const [[todayRow], [weekRow], [usersRow], allLogs] = await Promise.all([
      db.select({ value: count() }).from(downloadLogs).where(gte(downloadLogs.createdAt, today)),
      db.select({ value: count() }).from(downloadLogs).where(gte(downloadLogs.createdAt, weekStart)),
      db.select({ value: count() }).from(users).where(and(eq(users.status, "ACTIVE"), eq(users.role, "MEMBER"))),
      db.select().from(downloadLogs).where(isNotNull(downloadLogs.karaokeId)),
    ]);

    const karaokeCounts = new Map<string, number>();
    const collectionCounts = new Map<string, number>();
    for (const log of allLogs) {
      if (log.karaokeId) karaokeCounts.set(log.karaokeId, (karaokeCounts.get(log.karaokeId) ?? 0) + 1);
      if (log.collectionId) collectionCounts.set(log.collectionId, (collectionCounts.get(log.collectionId) ?? 0) + 1);
    }

    const topKaraokeIds = [...karaokeCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const topCollectionIds = [...collectionCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

    const topKaraokes = await Promise.all(
      topKaraokeIds.map(async ([id, downloads]) => {
        const k = await db.query.karaokes.findFirst({ where: eq(karaokes.id, id) });
        return { id, title: k?.title ?? "—", artist: k?.artist ?? "—", downloads };
      }),
    );
    const topCollections = await Promise.all(
      topCollectionIds.map(async ([id, downloads]) => {
        const c = await db.query.collections.findFirst({ where: eq(collections.id, id) });
        return { id, title: c?.title ?? "—", downloads };
      }),
    );

    const dto: AdminDashboardStatsDTO = {
      downloadsToday: todayRow?.value ?? 0,
      downloadsThisWeek: weekRow?.value ?? 0,
      activeUsers: usersRow?.value ?? 0,
      topKaraokes,
      topCollections,
    };
    return reply.send(dto);
  });
}
