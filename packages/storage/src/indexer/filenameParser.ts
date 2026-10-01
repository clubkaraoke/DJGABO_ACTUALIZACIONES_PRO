const MONTH_ALIASES: Array<[number, string[]]> = [
  [1, ["ENERO", "JANUARY"]],
  [2, ["FEBRERO", "FEBRUARY"]],
  [3, ["MARZO", "MARCH"]],
  [4, ["ABRIL", "APRIL"]],
  [5, ["MAYO", "MAY"]],
  [6, ["JUNIO", "JUNE"]],
  [7, ["JULIO", "JULY"]],
  [8, ["AGOSTO", "AUGUST"]],
  [9, ["SEPTIEMBRE", "SEPTEMBER"]],
  [10, ["OCTUBRE", "OCTOBER"]],
  [11, ["NOVIEMBRE", "NOVEMBER"]],
  [12, ["DICIEMBRE", "DECEMBER"]],
];

export function hasExplicitMonthName(folderName: string): boolean {
  const upper = folderName.trim().toUpperCase();
  return MONTH_ALIASES.some(([, aliases]) => aliases.some((alias) => upper.includes(alias)));
}

/**
 * Prefiere el nombre explícito del mes sobre el prefijo numérico.
 * Esto corrige carpetas históricas como:
 *   "09.- Top Hits - Agosto 2018" -> Agosto (8), no 9.
 * El número inicial queda solo como fallback cuando no hay nombre de mes.
 */
export function parseMonthFolder(folderName: string): number | null {
  const upper = folderName.trim().toUpperCase();

  for (const [month, aliases] of MONTH_ALIASES) {
    if (aliases.some((alias) => upper.includes(alias))) return month;
  }

  const numMatch = upper.match(/^(\d{1,2})/);
  if (numMatch) {
    const n = Number(numMatch[1]);
    if (n >= 1 && n <= 12) return n;
  }

  return null;
}

/**
 * Reconoce tanto una raíz normalizada ("2026") como la estructura real del
 * catálogo DJGABO (por ejemplo "15.- Hits Karaoke 2026"). El primer año
 * 20xx encontrado es la identidad temporal de esa carpeta.
 */
export function parseYearFolder(folderName: string): number | null {
  const match = folderName.trim().match(/(?:^|\D)(20\d{2})(?:\D|$)/);
  return match ? Number(match[1]) : null;
}

export interface ParsedFileName {
  artist: string;
  title: string;
  extension: string;
}

/** "GRUPO 5 - MOTOR Y MOTIVO.mp4" -> { artist: "Grupo 5", title: "Motor Y Motivo", extension: "mp4" } */
export function parseKaraokeFileName(fileName: string): ParsedFileName {
  const dot = fileName.lastIndexOf(".");
  const extension = dot === -1 ? "" : fileName.slice(dot + 1).toLowerCase();
  const base = dot === -1 ? fileName : fileName.slice(0, dot);
  const sepIdx = base.indexOf(" - ");
  const titleCase = (s: string) =>
    s.trim().toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());

  if (sepIdx === -1) {
    return { artist: "Desconocido", title: titleCase(base), extension };
  }
  return {
    artist: titleCase(base.slice(0, sepIdx)),
    title: titleCase(base.slice(sepIdx + 3)),
    extension,
  };
}

/** Código estable derivado del storageKey, usado como identificador de dedupe legible. */
export function deriveCodeFromKey(storageKey: string): string {
  let hash = 0;
  for (let i = 0; i < storageKey.length; i++) {
    hash = (hash * 31 + storageKey.charCodeAt(i)) >>> 0;
  }
  return `DJG-${hash.toString(36).toUpperCase().padStart(6, "0")}`;
}
