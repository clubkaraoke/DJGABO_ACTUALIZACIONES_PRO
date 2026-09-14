import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { signDeviceToken } from "../auth/deviceToken.js";
import { deviceSessions } from "../db/schema.js";
import { createId } from "../db/id.js";

const registerSchema = z.object({
  deviceName: z.string().max(120).optional(),
});

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
      const parsed = registerSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: "INVALID_INPUT", message: "Nombre de dispositivo inválido", statusCode: 400 });
      }
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
        name: parsed.data.deviceName ?? null,
        active: true,
        lastSeenAt: new Date(),
      });

      const deviceToken = signDeviceToken(env, { deviceId, userId });
      return reply.code(201).send({ deviceToken, deviceId });
    },
  );
}
