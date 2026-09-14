import jwt from "jsonwebtoken";
import type { Env } from "../env.js";

export interface DeviceTokenPayload {
  deviceId: string;
  userId: string;
}

/**
 * SEGURIDAD DE DISPOSITIVOS (punto 5)
 * ====================================
 * El deviceId YA NO lo elige ni lo genera el cliente. Antes, cualquiera
 * podía copiar/inventar un string y, si coincidía con uno "conocido", el
 * límite de dispositivos se evadía por completo (un deviceId conocido
 * siempre se permite, sin tope). Ahora:
 *
 *  1. El cliente pide un dispositivo nuevo a POST /api/devices/register
 *     (sin poder elegir su ID).
 *  2. El servidor decide si hay cupo (AuthorizationService.canRegisterDevice),
 *     genera el deviceId él mismo, y firma este token con un secreto que el
 *     cliente nunca tiene.
 *  3. Cada descarga debe enviar este token firmado (header
 *     `X-Device-Token`); el servidor lo verifica y usa el deviceId que
 *     contiene — nunca un deviceId suelto en el body.
 *
 * Límite honesto de este modelo: como cualquier credencial guardada en el
 * navegador, el token firmado en sí podría copiarse a otra máquina si esa
 * máquina también tiene una sesión autenticada válida de la misma cuenta
 * (JWT robado). Pero ya no se puede FABRICAR un deviceId "conocido" nuevo a
 * voluntad ni reutilizar una firma de otro usuario — la superficie de
 * ataque se reduce a "robar credenciales", no a "adivinar/editar un string".
 */
export function signDeviceToken(env: Env, payload: DeviceTokenPayload): string {
  // Sin expiración corta: es una credencial de dispositivo de larga vida,
  // no una sesión. Se revoca desactivando el DeviceSession en la base de
  // datos (ver verifyDeviceTokenAgainstRepo), no dejándola expirar.
  return jwt.sign(payload, env.DEVICE_TOKEN_SECRET);
}

export function verifyDeviceToken(env: Env, token: string): DeviceTokenPayload {
  const decoded = jwt.verify(token, env.DEVICE_TOKEN_SECRET);
  if (typeof decoded === "string" || !decoded.deviceId || !decoded.userId) {
    throw new Error("Payload de device token inválido");
  }
  return { deviceId: decoded.deviceId as string, userId: decoded.userId as string };
}
