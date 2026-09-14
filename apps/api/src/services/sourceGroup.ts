/**
 * Obtiene la subcarpeta/marca situada directamente debajo de la carpeta del
 * mes. No persiste información duplicada: el path del Asset sigue siendo la
 * fuente de verdad y el frontend recibe un nombre de grupo derivado.
 *
 * Ejemplo:
 * collectionStoragePath = /.../2026/05 MAYO
 * storageKey            = /.../2026/05 MAYO/02_KK-Live/Tema.mp4
 * => 02_KK-Live
 */
export function deriveSourceGroup(storageKey: string, collectionStoragePath: string): string | null {
  const base = collectionStoragePath.replace(/\/+$/, "");
  const prefix = `${base}/`;

  if (!storageKey.startsWith(prefix)) return null;

  const relative = storageKey.slice(prefix.length).split("/").filter(Boolean);
  if (relative.length < 2) return null; // archivo directo en el mes

  return relative[0] ?? null;
}

/** Nombre presentable para UI sin perder el nombre técnico original en DB. */
export function prettifySourceGroup(group: string): string {
  return group
    .replace(/^\d{1,2}[_ .-]*/, "")
    .replace(/_/g, " ")
    .replace(/\bkk\b/gi, "KK")
    .replace(/\bdj\b/gi, "DJ")
    .replace(/\brfk\b/gi, "RFK")
    .trim();
}
