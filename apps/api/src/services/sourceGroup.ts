import { parseMonthFolder, parseYearFolder } from "@djgabo/storage";

function splitPath(path: string): string[] {
  return path.replace(/\\/g, "/").split("/").filter(Boolean);
}

function findYearMonth(path: string): { year: number; month: number } | null {
  const segments = splitPath(path);

  for (let i = 0; i < segments.length - 1; i += 1) {
    const year = parseYearFolder(segments[i]!);
    const month = parseMonthFolder(segments[i + 1]!);
    if (year !== null && month !== null) return { year, month };
  }

  return null;
}

/**
 * Obtiene la subcarpeta/marca situada directamente debajo de la carpeta del
 * mes. No persiste información duplicada: el path del Asset sigue siendo la
 * fuente de verdad y el frontend recibe un nombre de grupo derivado.
 *
 * Camino normal:
 * collectionStoragePath = /.../2026/05 MAYO
 * storageKey            = /.../2026/05 MAYO/02_KK-Live/Tema.mp4
 * => 02_KK-Live
 *
 * Si la colección fue pre-creada con otro root (por ejemplo ACTUALIZACIONES)
 * pero el Asset real vive en ACTUALIZACIONES_TEST, usa el año/mes de la
 * colección como ancla temporal y deriva el grupo desde el storageKey real.
 */
export function deriveSourceGroup(storageKey: string, collectionStoragePath: string): string | null {
  const normalizedStorageKey = storageKey.replace(/\\/g, "/");
  const base = collectionStoragePath.replace(/\\/g, "/").replace(/\/+$/, "");
  const prefix = `${base}/`;

  if (normalizedStorageKey.startsWith(prefix)) {
    const relative = normalizedStorageKey.slice(prefix.length).split("/").filter(Boolean);
    if (relative.length < 2) return null; // archivo directo en el mes
    return relative[0] ?? null;
  }

  const target = findYearMonth(collectionStoragePath);
  if (!target) return null;

  const assetSegments = splitPath(normalizedStorageKey);
  for (let i = 0; i < assetSegments.length - 1; i += 1) {
    const year = parseYearFolder(assetSegments[i]!);
    const month = parseMonthFolder(assetSegments[i + 1]!);
    if (year !== target.year || month !== target.month) continue;

    const groupIndex = i + 2;
    // Debe existir tanto la carpeta de grupo como al menos un archivo debajo.
    if (groupIndex >= assetSegments.length - 1) return null;
    return assetSegments[groupIndex] ?? null;
  }

  return null;
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
