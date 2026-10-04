import type { KaraokeSummaryDTO } from "@djgabo/shared";

function normalizeKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_./-]+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function knownFolderAlias(realName: string): string | null {
  const value = normalizeKey(realName);

  if (
    value.includes("club karaoke") ||
    value.includes("el club karaoke") ||
    value.includes("prod club")
  ) return "Club Karaoke";

  if (
    value === "kkl" ||
    value.includes("kk live") ||
    value.includes("k live") ||
    value.includes("karaokanta")
  ) return "Top Hits 01";

  if (
    value.includes("luis fer") ||
    value.includes("luisfer") ||
    value.includes("prod luis fer")
  ) return "Top Hits 02";

  if (
    value.includes("dj sa") ||
    value.includes("dj sauly") ||
    value.includes("sauly") ||
    value.includes("prod djsauly")
  ) return "Top Hits 03";

  if (
    value === "rf" ||
    value === "ra f" ||
    value === "raf" ||
    value.includes("rf 01") ||
    value.includes("rfk") ||
    value.includes("rafiki") ||
    value.includes("prod rafiki")
  ) return "Top Hits 04";

  return null;
}

/**
 * Convierte nombres físicos/privados de carpetas en alias de presentación.
 * Nunca altera el path ni el identificador real que usa Dropbox.
 */
export function buildPublicFolderAliases(realNames: string[]): Map<string, string> {
  const unique = [...new Set(realNames.filter(Boolean))];
  const aliases = new Map<string, string>();
  const used = new Set<number>();

  for (const realName of unique) {
    const alias = knownFolderAlias(realName);
    if (!alias) continue;
    aliases.set(realName, alias);
    const match = alias.match(/^Top Hits (\d{2})$/);
    if (match) used.add(Number(match[1]));
  }

  let next = 1;
  for (const realName of unique) {
    if (aliases.has(realName)) continue;
    while (used.has(next)) next += 1;
    aliases.set(realName, `Top Hits ${String(next).padStart(2, "0")}`);
    used.add(next);
    next += 1;
  }

  return aliases;
}

const BRAND_PHRASES = [
  /\bkaraokanta(?:\s+live)?\b/gi,
  /\blf\s+karaokes?\b/gi,
  /\bluis\s*fer(?:\s+karaokes?)?\b/gi,
  /\bdj\s*sauly(?:\s+karaokes?)?\b/gi,
  /\bsauly(?:\s+karaokes?)?\b/gi,
  /\bdj\s*sa(?:\s+karaokes?)?\b/gi,
  /\bkk[\s-]*live\b/gi,
  /\bkkl\b/gi,
  /\brfk\b/gi,
  /\brafiki(?:\s+karaokes?)?\b/gi,
  /\bclub\s+karaoke\b/gi,
  /\bel\s+club\s+karaoke\b/gi,
  /\bdjgabo\b/gi,
];

function hasBrand(value: string): boolean {
  return BRAND_PHRASES.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(value);
  });
}

function cleanVisibleText(value: string): string {
  let out = value ?? "";

  // Elimina bloques completos cuya única utilidad es firmar la marca.
  out = out
    .replace(/\[([^\]]+)\]/g, (full, inner: string) => (hasBrand(inner) ? "" : full))
    .replace(/\(([^)]+)\)/g, (full, inner: string) => (hasBrand(inner) ? "" : full));

  for (const pattern of BRAND_PHRASES) {
    pattern.lastIndex = 0;
    out = out.replace(pattern, "");
  }

  // Abreviaturas/firma aisladas al final del nombre.
  out = out
    .replace(/(?:^|\s)[\[(]?(?:lf|kk|rfk)[\])]?\s*$/i, "")
    .replace(/\s+-\s+(?:karaokes?|producciones?)\s*$/i, "")
    .replace(/\s+(?:karaokes?)\s*$/i, "")
    .replace(/\(\s*inst\s*\)/gi, "(Instrumental)")
    .replace(/\[\s*\]|\(\s*\)/g, "")
    .replace(/\s*[-–—|·]+\s*$/g, "")
    .replace(/^\s*[-–—|·]+\s*/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:)\]])/g, "$1")
    .replace(/([([])\s+/g, "$1")
    .trim();

  return out;
}

export interface PublicKaraokeDisplay {
  artist: string;
  title: string;
  label: string;
}

export function publicKaraokeDisplay(karaoke: Pick<KaraokeSummaryDTO, "artist" | "title">): PublicKaraokeDisplay {
  const artist = cleanVisibleText(karaoke.artist) || "Desconocido";
  const title = cleanVisibleText(karaoke.title) || "Sin título";
  return {
    artist,
    title,
    label: `${artist} - ${title}`,
  };
}

export function publicSearchMatches(
  karaoke: Pick<KaraokeSummaryDTO, "artist" | "title" | "code">,
  query: string,
): boolean {
  const q = normalizeKey(query);
  if (!q) return true;
  const display = publicKaraokeDisplay(karaoke);
  return [display.artist, display.title, display.label, karaoke.code]
    .some((value) => normalizeKey(value).includes(q));
}
