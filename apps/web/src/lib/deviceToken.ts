import { api, ApiError } from "./apiClient";

const DEVICE_TOKEN_KEY = "djgabo.deviceToken";

/**
 * SEGURIDAD DE DISPOSITIVOS (punto 5)
 * ====================================
 * El frontend YA NO inventa un deviceId propio (antes era un UUID cualquiera
 * guardado en localStorage, copiable/editable a mano — eso permitía evadir
 * el límite de dispositivos). Ahora el ID lo genera el servidor y lo entrega
 * envuelto en un token firmado que este módulo guarda y reenvía.
 */
export function getStoredDeviceToken(): string | null {
  return localStorage.getItem(DEVICE_TOKEN_KEY);
}

function storeDeviceToken(token: string): void {
  localStorage.setItem(DEVICE_TOKEN_KEY, token);
}

export function clearStoredDeviceToken(): void {
  localStorage.removeItem(DEVICE_TOKEN_KEY);
}

async function registerNewDevice(): Promise<string> {
  const deviceName = typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 100) : "Navegador";
  const res = await api.post<{ deviceToken: string; deviceId: string }>("/devices/register", { deviceName });
  storeDeviceToken(res.deviceToken);
  return res.deviceToken;
}

/** Devuelve un device token válido, registrando el dispositivo la primera vez que se necesita. */
export async function ensureDeviceToken(): Promise<string> {
  const existing = getStoredDeviceToken();
  if (existing) return existing;
  return registerNewDevice();
}

/**
 * Ejecuta una acción que requiere device token (descargas). Si el servidor
 * rechaza el token guardado (por ejemplo, fue desactivado por un admin),
 * se limpia y se reintenta UNA vez con un dispositivo recién registrado —
 * nunca se reintenta en bucle.
 */
export async function withDeviceToken<T>(action: (deviceToken: string) => Promise<T>): Promise<T> {
  const token = await ensureDeviceToken();
  try {
    return await action(token);
  } catch (err) {
    if (err instanceof ApiError && err.code === "DEVICE_TOKEN_INVALID") {
      clearStoredDeviceToken();
      const freshToken = await registerNewDevice();
      return action(freshToken);
    }
    throw err;
  }
}
