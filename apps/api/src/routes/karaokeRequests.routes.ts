import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { KaraokeRequestStatus } from "../services/KaraokeRequestService.js";

const createSchema = z.object({
  youtubeUrl: z.string().url().max(500),
});

const updateSchema = z.object({
  status: z.enum(["REQUESTED", "IN_PROGRESS", "READY", "REJECTED"]),
});

export async function registerKaraokeRequestRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/api/karaoke-requests",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      return reply.send(await fastify.karaokeRequestService.listForUser(request.authUser!.sub));
    },
  );

  fastify.post(
    "/api/karaoke-requests",
    {
      preHandler: fastify.authenticate,
      config: { rateLimit: { max: 12, timeWindow: "1 hour" } },
    },
    async (request, reply) => {
      const parsed = createSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: "INVALID_INPUT",
          message: "Ingresa un enlace válido de YouTube.",
          statusCode: 400,
        });
      }

      try {
        const result = await fastify.karaokeRequestService.create(
          request.authUser!.sub,
          parsed.data.youtubeUrl,
        );
        return reply.code(result.alreadyAvailable ? 200 : 201).send(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : "REQUEST_FAILED";
        if (message === "INVALID_YOUTUBE_URL") {
          return reply.code(400).send({
            error: message,
            message: "El enlace debe corresponder a un video de YouTube.",
            statusCode: 400,
          });
        }
        throw error;
      }
    },
  );

  const adminGuard = {
    preHandler: [fastify.authenticate, fastify.requireRole("ADMIN")],
  };

  fastify.get("/api/admin/karaoke-requests", adminGuard, async (_request, reply) => {
    return reply.send(await fastify.karaokeRequestService.listAll());
  });

  fastify.patch<{ Params: { id: string } }>(
    "/api/admin/karaoke-requests/:id",
    adminGuard,
    async (request, reply) => {
      const parsed = updateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: "INVALID_INPUT",
          message: "Estado de pedido inválido.",
          statusCode: 400,
        });
      }

      const updated = await fastify.karaokeRequestService.updateStatus(
        request.params.id,
        parsed.data.status as KaraokeRequestStatus,
      );
      if (!updated) {
        return reply.code(404).send({
          error: "REQUEST_NOT_FOUND",
          message: "Pedido no encontrado.",
          statusCode: 404,
        });
      }
      return reply.send(updated);
    },
  );
}
