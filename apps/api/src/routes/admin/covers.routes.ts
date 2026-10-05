import type { FastifyInstance } from "fastify";

export async function registerAdminCoverRoutes(fastify: FastifyInstance) {
  const guard = { preHandler: [fastify.authenticate, fastify.requireRole("ADMIN")] };

  fastify.get("/api/admin/covers/status", guard, async (_request, reply) => {
    return reply.send(await fastify.coverEnrichmentService.getStatus());
  });

  fastify.post("/api/admin/covers/run", guard, async (_request, reply) => {
    fastify.coverEnrichmentService.startDrain(async () => {
      await fastify.catalogJsonService.publishAll();
    });
    return reply.code(202).send(await fastify.coverEnrichmentService.getStatus());
  });

  fastify.post("/api/admin/covers/retry-misses", guard, async (_request, reply) => {
    await fastify.coverEnrichmentService.retryMisses();
    fastify.coverEnrichmentService.startDrain(async () => {
      await fastify.catalogJsonService.publishAll();
    });
    return reply.code(202).send(await fastify.coverEnrichmentService.getStatus());
  });
}
