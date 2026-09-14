import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { collections, karaokes } from "../db/schema.js";

const DEEZER_SEARCH_URL = "https://api.deezer.com/search";
const DEFAULT_BATCH_LIMIT = 60;
const DEFAULT_CONCURRENCY = 6;
const REQUEST_TIMEOUT_MS = 3000;

interface DeezerTrack {
  title?: string;
  title_short?: string;
  artist?: { name?: string };
  album?: {
    cover?: string;
    cover_medium?: string;
    cover_big?: string;
  };
}

interface DeezerSearchResponse {
  data?: DeezerTrack[];
}

export interface DeezerCoverEnrichmentResult {
  checked: number;
  matched: number;
  missing: number;
  errors: number;
}

/**
 * Quita etiquetas técnicas propias del archivo karaoke antes de buscar la
 * canción en Deezer. La metadata original del portal NO se modifica aquí;
 * esto solo construye una consulta más limpia para encontrar la portada.
 */
export function cleanForDeezerSearch(value: string): string {
  return value
    .replace(/\[[^\]]*(?:karaoke|dj\s*sauly)[^\]]*\]/gi, " ")
    .replace(/\s+-\s+lf\s+karaokes?.*$/gi, " ")
    .replace(/\s+karaoke\b.*$/gi, " ")
    .replace(/\((?:coro|coros|con\s+\d+(?:da|ra)?\s+voz|instrumental|inst)\)/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function normalize(value: string): string {
  return cleanForDeezerSearch(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenCoverage(target: string, candidate: string): number {
  const targetTokens = new Set(normalize(target).split(" ").filter(Boolean));
  const candidateTokens = new Set(normalize(candidate).split(" ").filter(Boolean));
  if (targetTokens.size === 0 || candidateTokens.size === 0) return 0;
  let hits = 0;
  for (const token of targetTokens) {
    if (candidateTokens.has(token)) hits += 1;
  }
  return hits / targetTokens.size;
}

function trackScore(track: DeezerTrack, artist: string, title: string): number {
  const candidateTitle = track.title_short ?? track.title ?? "";
  const candidateArtist = track.artist?.name ?? "";
  const cleanTitle = cleanForDeezerSearch(title);
  const cleanArtist = cleanForDeezerSearch(artist);

  const titleScore = tokenCoverage(cleanTitle, candidateTitle);
  const artistScore = tokenCoverage(cleanArtist, candidateArtist);
  const exactTitleBonus = normalize(cleanTitle) === normalize(candidateTitle) ? 0.2 : 0;

  return titleScore * 0.72 + artistScore * 0.28 + exactTitleBonus;
}

/**
 * Busca UNA portada. Está separado para poder testearlo con fetch mock.
 * No requiere secretos: se usa el endpoint público de búsqueda de Deezer.
 */
export async function findDeezerCover(
  artist: string,
  title: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const cleanArtist = cleanForDeezerSearch(artist);
  const cleanTitle = cleanForDeezerSearch(title);
  if (!cleanTitle) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const query = [cleanArtist, cleanTitle].filter(Boolean).join(" ");
    const url = `${DEEZER_SEARCH_URL}?q=${encodeURIComponent(query)}&limit=5`;
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) return null;

    const payload = (await response.json()) as DeezerSearchResponse;
    const candidates = (payload.data ?? [])
      .map((track) => ({ track, score: trackScore(track, cleanArtist, cleanTitle) }))
      .sort((a, b) => b.score - a.score);

    const best = candidates[0];
    // Umbral deliberadamente conservador: preferimos una tarjeta sin portada
    // antes que asignar el disco de otra canción con un nombre parecido.
    if (!best || best.score < 0.46) return null;

    return best.track.album?.cover_medium ?? best.track.album?.cover_big ?? best.track.album?.cover ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Enriquece solo karaokes SIN cover, en lotes pequeños. Las búsquedas remotas
 * se hacen con concurrencia acotada; las escrituras SQLite se hacen después,
 * de forma secuencial, para evitar lock contention.
 *
 * Esto corre fuera del request crítico del cliente: el navegador nunca hace
 * N llamadas a Deezer al renderizar las tarjetas. Una vez resuelta, la URL se
 * persiste en `karaokes.cover_url`, por lo que las siguientes cargas son una
 * sola lectura normal de nuestra API.
 */
export async function enrichMissingDeezerCovers(
  db: Db,
  options: {
    limit?: number;
    concurrency?: number;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<DeezerCoverEnrichmentResult> {
  const limit = Math.max(1, options.limit ?? DEFAULT_BATCH_LIMIT);
  const concurrency = Math.max(1, Math.min(10, options.concurrency ?? DEFAULT_CONCURRENCY));
  const fetchImpl = options.fetchImpl ?? fetch;

  const rows = await db
    .select({
      id: karaokes.id,
      artist: karaokes.artist,
      title: karaokes.title,
      collectionId: karaokes.collectionId,
    })
    .from(karaokes)
    .where(isNull(karaokes.coverUrl))
    .limit(limit);

  const cache = new Map<string, Promise<string | null>>();
  const matches: Array<{ id: string; collectionId: string; coverUrl: string }> = [];
  let errors = 0;

  for (let offset = 0; offset < rows.length; offset += concurrency) {
    const chunk = rows.slice(offset, offset + concurrency);
    const chunkResults = await Promise.all(
      chunk.map(async (row) => {
        const cacheKey = `${normalize(row.artist)}::${normalize(row.title)}`;
        let coverPromise = cache.get(cacheKey);
        if (!coverPromise) {
          coverPromise = findDeezerCover(row.artist, row.title, fetchImpl);
          cache.set(cacheKey, coverPromise);
        }
        try {
          const coverUrl = await coverPromise;
          return coverUrl ? { ...row, coverUrl } : null;
        } catch {
          errors += 1;
          return null;
        }
      }),
    );
    for (const result of chunkResults) {
      if (result) matches.push(result);
    }
  }

  // Escrituras deliberadamente secuenciales: mejor comportamiento con SQLite.
  for (const match of matches) {
    await db.update(karaokes).set({ coverUrl: match.coverUrl }).where(eq(karaokes.id, match.id));

    // La portada de colección se completa con la primera portada real hallada
    // si todavía no existe. No se sobreescribe una portada elegida por admin.
    await db
      .update(collections)
      .set({ coverUrl: match.coverUrl })
      .where(and(eq(collections.id, match.collectionId), isNull(collections.coverUrl)));
  }

  return {
    checked: rows.length,
    matched: matches.length,
    missing: rows.length - matches.length,
    errors,
  };
}
