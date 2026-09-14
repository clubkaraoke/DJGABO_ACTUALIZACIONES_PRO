import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, asc } from "drizzle-orm";
import { plans } from "../../db/schema.js";
import { createId } from "../../db/id.js";

const planSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().optional(),
  active: z.boolean().default(true),
  maxDevices: z.number().int().min(1).max(20).default(2),
});

export async function registerAdminPlansRoutes(fastify: FastifyInstance) {
  const { db } = fastify;
  const guard = { preHandler: [fastify.authenticate, fastify.requireRole("ADMIN")] };

  fastify.get("/api/admin/plans", guard, async (_request, reply) => {
    const allPlans = await db.query.plans.findMany({ orderBy: asc(plans.name) });
    return reply.send(allPlans);
  });

  fastify.post("/api/admin/plans", guard, async (request, reply) => {
    const parsed = planSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "INVALID_INPUT", message: "Datos de plan inválidos", statusCode: 400 });
    }
    const now = new Date();
    const id = createId("plan");
    await db.insert(plans).values({ id, ...parsed.data, createdAt: now, updatedAt: now });
    const plan = await db.query.plans.findFirst({ where: eq(plans.id, id) });
    return reply.code(201).send(plan);
  });

  fastify.patch<{ Params: { id: string } }>("/api/admin/plans/:id", guard, async (request, reply) => {
    const parsed = planSchema.partial().safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "INVALID_INPUT", message: "Datos de plan inválidos", statusCode: 400 });
    }
    await db.update(plans).set({ ...parsed.data, updatedAt: new Date() }).where(eq(plans.id, request.params.id));
    const plan = await db.query.plans.findFirst({ where: eq(plans.id, request.params.id) });
    return reply.send(plan);
  });
}
