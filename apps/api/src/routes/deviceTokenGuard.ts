import type { FastifyRequest } from "fastify";
import { eq, and } from "drizzle-orm";
import type { Env } from "../env.js";
import { verifyDeviceToken } from "../auth/deviceToken.js";
import type { Db } from "../db/client.js";
import { deviceSessions } from "../db/schema.js";

export type DeviceResolution =
  | { ok: true; deviceId: string }
  | { ok: false; reason: "DEVICE_TOKEN_REQUIRED" | "DEVICE_TOKEN_INVALID" };

/**
 * Único punto donde se decide "cuál es el dispositivo que hace esta
 * petición". Verifica la firma del token, que pertenezca al usuario
 * autenticado de ESTA sesión (no a otro), y que el DeviceSession siga
 * activo en la base de datos (permite revocar un dispositivo sin esperar a
 * que el token expire, ya que no tiene expiración corta).
 */
export async function resolveVerifiedDeviceId(request: FastifyRequest, env: Env, db: Db): Promise<DeviceResolution> {
  const header = request.headers["x-device-token"];
  const token = Array.isArray(header) ? header[0] : header;
  if (!token) return { ok: false, reason: "DEVICE_TOKEN_REQUIRED" };

  let payload;
  try {
    payload = verifyDeviceToken(env, token);
  } catch {
    return { ok: false, reason: "DEVICE_TOKEN_INVALID" };
  }

  if (payload.userId !== request.authUser!.sub) {
    // El token es válido, pero fue emitido para OTRO usuario: nunca se
    // reutiliza la identidad de dispositivo de una cuenta ajena.
    return { ok: false, reason: "DEVICE_TOKEN_INVALID" };
  }

  const session = await db.query.deviceSessions.findFirst({
    where: and(eq(deviceSessions.userId, payload.userId), eq(deviceSessions.deviceId, payload.deviceId)),
  });
  if (!session || !session.active) {
    return { ok: false, reason: "DEVICE_TOKEN_INVALID" };
  }

  return { ok: true, deviceId: payload.deviceId };
}
