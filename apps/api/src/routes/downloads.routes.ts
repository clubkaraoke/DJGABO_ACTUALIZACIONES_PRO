import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { BatchStrategy } from "@djgabo/shared";
import type { TemporaryUrlDTO } from "@djgabo/shared";
import { resolveVerifiedDeviceId } from "./deviceTokenGuard.js";

const batchBodySchema = z.object({
  strategy: z.nativeEnum(BatchStrategy).default(BatchStrategy.MULTI_FILE),
});

const reasonToStatus: Record<string, number> = {
  USER_NOT_FOUND: 401,
  USER_SUSPENDED: 403,
  USER_EXPIRED: 403,
  COLLECTION_NOT_FOUND: 404,
  COLLECTION_INACTIVE: 403,
  ACCESS_NOT_GRANTED: 403,
  ACCESS_DISABLED: 403,
  ACCESS_EXPIRED: 403,
  DEVICE_LIMIT_REACHED: 409,
  DEVICE_TOKEN_REQUIRED: 401,
  DEVICE_TOKEN_INVALID: 401,
  KARAOKE_NOT_FOUND: 404,
  ASSET_NOT_AVAILABLE: 404,
  ARCHIVE_NOT_AVAILABLE: 404,
};

/**
 * Nunca se devuelve storageKey, path físico ni el link permanente de
 * Dropbox: solo URLs temporales de vida corta (punto 17).
 *
 * El deviceId YA NO viene del body: se deriva del header `X-Device-Token`,
 * firmado por el servidor en /api/devices/register (punto 5). Si falta o es
 * inválido, la descarga se rechaza — no hay forma de "saltarse" el límite
 * de dispositivos omitiendo el campo.
 */
export async function registerDownloadsRoutes(fastify: FastifyInstance) {
  const { env, db } = fastify;

  fastify.post<{ Params: { id: string } }>(
    "/api/downloads/karaoke/:id",
    {
      preHandler: fastify.authenticate,
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const deviceResolution = await resolveVerifiedDeviceId(request, env, db);
      if (!deviceResolution.ok) {
        const status = reasonToStatus[deviceResolution.reason] ?? 401;
        return reply.code(status).send({ error: deviceResolution.reason, message: describeReason(deviceResolution.reason), statusCode: status });
      }

      const result = await fastify.downloadService.downloadKaraoke(request.authUser!.sub, request.params.id, {
        deviceId: deviceResolution.deviceId,
        ip: request.ip,
      });
      if (!result.ok) {
        const status = reasonToStatus[result.reason] ?? 403;
        return reply.code(status).send({ error: result.reason, message: describeReason(result.reason), statusCode: status });
      }
      const dto: TemporaryUrlDTO = {
        url: result.url,
        expiresAt: result.expiresAt?.toISOString() ?? null,
        type: "MASTER",
        fileName: result.fileName,
        mimeType: result.mimeType,
      };
      return reply.send(dto);
    },
  );

  fastify.post<{ Params: { id: string } }>(
    "/api/downloads/collection/:id",
    {
      preHandler: fastify.authenticate,
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const parsed = batchBodySchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: "INVALID_INPUT", message: "Parámetros inválidos", statusCode: 400 });
      }
      const deviceResolution = await resolveVerifiedDeviceId(request, env, db);
      if (!deviceResolution.ok) {
        const status = reasonToStatus[deviceResolution.reason] ?? 401;
        return reply.code(status).send({ error: deviceResolution.reason, message: describeReason(deviceResolution.reason), statusCode: status });
      }

      const result = await fastify.batchDownloadService.downloadCollection(
        request.authUser!.sub,
        request.params.id,
        parsed.data.strategy,
        { deviceId: deviceResolution.deviceId, ip: request.ip },
      );
      if (!result.ok) {
        const status = reasonToStatus[result.reason] ?? 403;
        return reply.code(status).send({ error: result.reason, message: describeReason(result.reason), statusCode: status });
      }
      return reply.send(result);
    },
  );
}

function describeReason(reason: string): string {
  const messages: Record<string, string> = {
    USER_SUSPENDED: "Tu cuenta está suspendida.",
    USER_EXPIRED: "Tu membresía ha vencido.",
    COLLECTION_INACTIVE: "Esta colección no está disponible.",
    ACCESS_NOT_GRANTED: "No tienes acceso a esta colección.",
    ACCESS_DISABLED: "Tu acceso a esta colección fue desactivado.",
    ACCESS_EXPIRED: "Tu acceso a esta colección venció.",
    DEVICE_LIMIT_REACHED: "Alcanzaste el límite de dispositivos de tu plan.",
    DEVICE_TOKEN_REQUIRED: "Falta registrar este dispositivo antes de descargar.",
    DEVICE_TOKEN_INVALID: "El dispositivo no es válido o fue desactivado. Vuelve a registrarlo.",
    KARAOKE_NOT_FOUND: "Karaoke no encontrado.",
    ASSET_NOT_AVAILABLE: "El archivo todavía no está disponible.",
    ARCHIVE_NOT_AVAILABLE: "El ZIP de esta colección todavía no está armado. Usa la descarga por archivos individuales.",
    COLLECTION_NOT_FOUND: "Colección no encontrada.",
  };
  return messages[reason] ?? "No se pudo completar la operación.";
}
