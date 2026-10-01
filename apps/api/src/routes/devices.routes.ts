import type { FastifyInstance } from "fastify";
import { signDeviceToken } from "../auth/deviceToken.js";
import { deviceSessions } from "../db/schema.js";
import { createId } from "../db/id.js";

/**
 * POST /api/devices/register
 * El cliente NUNCA propone un deviceId (punto 5). Si hay cupo
 * (AuthorizationService.canRegisterDevice), el servidor genera uno,
 * registra el DeviceSession y devuelve un token firmado que el cliente
 * deberá reenviar en cada descarga (header X-Device-Token).
 */
export async function registerDeviceRoutes(fastify: FastifyInstance) {
  const { db, env } = fastify;

  fastify.post(
    "/api/devices/register",
    { preHandler: fastify.authenticate, config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const rawBody =
        request.body && typeof request.body === "object"
          ? (request.body as Record<string, unknown>)
          : {};
      const rawDeviceName =
        typeof rawBody.deviceName === "string"
          ? rawBody.deviceName
          : typeof rawBody.name === "string"
            ? rawBody.name
            : null;
      const safeDeviceName = rawDeviceName?.trim().slice(0, 120) || "Navegador";
      const userId = request.authUser!.sub;

      const check = await fastify.authorizationService.canRegisterDevice(userId);
      if (!check.allowed) {
        const status = check.reason === "DEVICE_LIMIT_REACHED" ? 409 : 403;
        return reply.code(status).send({
          error: check.reason ?? "FORBIDDEN",
          message:
            check.reason === "DEVICE_LIMIT_REACHED"
              ? "Alcanzaste el límite de dispositivos de tu plan."
              : "No se pudo registrar el dispositivo.",
          statusCode: status,
        });
      }

      const deviceId = createId("dev");
      await db.insert(deviceSessions).values({
        id: createId("devrow"),
        userId,
        deviceId,
        name: safeDeviceName,
        active: true,
        lastSeenAt: new Date(),
      });

      const deviceToken = signDeviceToken(env, { deviceId, userId });
      return reply.code(201).send({ deviceToken, deviceId });
    },
  );
}
