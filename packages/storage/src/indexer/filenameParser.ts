const MONTHS_ES = [
  "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
  "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE",
];

/** "09 SEPTIEMBRE" -> 9. Acepta también solo el nombre del mes. */
export function parseMonthFolder(folderName: string): number | null {
  const upper = folderName.trim().toUpperCase();
  const numMatch = upper.match(/^(\d{1,2})/);
  if (numMatch) {
    const n = Number(numMatch[1]);
    if (n >= 1 && n <= 12) return n;
  }
  const idx = MONTHS_ES.findIndex((m) => upper.includes(m));
  return idx === -1 ? null : idx + 1;
}

export function parseYearFolder(folderName: string): number | null {
  const match = folderName.trim().match(/^(20\d{2})$/);
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
