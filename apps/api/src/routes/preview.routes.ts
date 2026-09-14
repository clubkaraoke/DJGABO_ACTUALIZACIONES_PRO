import type { FastifyInstance } from "fastify";
import type { TemporaryUrlDTO } from "@djgabo/shared";

const reasonToStatus: Record<string, number> = {
  USER_SUSPENDED: 403,
  USER_EXPIRED: 403,
  COLLECTION_INACTIVE: 403,
  ACCESS_NOT_GRANTED: 403,
  ACCESS_DISABLED: 403,
  ACCESS_EXPIRED: 403,
  KARAOKE_NOT_FOUND: 404,
  ASSET_NOT_AVAILABLE: 404,
};

/** CLIENTE → API → permiso → previewAsset → URL temporal → reproductor (punto 16). */
export async function registerPreviewRoutes(fastify: FastifyInstance) {
  fastify.post<{ Params: { id: string } }>(
    "/api/preview/karaoke/:id",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const result = await fastify.previewService.getPreviewUrl(request.authUser!.sub, request.params.id);
      if (!result.ok) {
        const status = reasonToStatus[result.reason] ?? 403;
        return reply.code(status).send({ error: result.reason, message: "No se pudo generar el preview", statusCode: status });
      }
      const dto: TemporaryUrlDTO = {
        url: result.url,
        expiresAt: result.expiresAt?.toISOString() ?? null,
        type: "PREVIEW",
        fileName: result.fileName,
        mimeType: result.mimeType,
      };
      return reply.send(dto);
    },
  );
}
