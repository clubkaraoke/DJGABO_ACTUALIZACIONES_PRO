import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { and, desc, eq, isNull } from "drizzle-orm";
import { DeezerPublicApi } from "deezer-public-api";
import type { Db } from "../db/client.js";
import { collections, karaokes } from "../db/schema.js";

type Provider = "deezer" | "itunes";
type CacheStatus = "MATCHED" | "NO_MATCH" | "ERROR";

interface CacheEntry {
  status: CacheStatus;
  provider: Provider | null;
  coverUrl: string | null;
  score: number | null;
  checkedAt: string;
  retryAfter: string | null;
  providerTitle?: string | null;
  providerArtist?: string | null;
}

interface CacheDocument {
  version: 3;
  updatedAt: string;
  entries: Record<string, CacheEntry>;
}

export interface CoverEnrichmentStatus {
  running: boolean;
  total: number;
  withCover: number;
  matchedFromCache: number;
  noMatch: number;
  errors: number;
  pending: number;
  complete: boolean;
  startedAt: string | null;
  completedAt: string | null;
  lastError: string | null;
}

export interface CoverEnrichmentRunResult {
  checked: number;
  matched: number;
  noMatch: number;
  errors: number;
}

interface Candidate {
  provider: Provider;
  coverUrl: string;
  title: string;
  artist: string;
  score: number;
  titleScore: number;
  artistScore: number;
}

const NO_MATCH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ERROR_TTL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_CONCURRENCY = 5;
const BETWEEN_BATCHES_MS = 250;
const REQUEST_TIMEOUT_MS = 5000;

const NOISE = new Set([
  "karaoke", "karaokes", "karoke", "karokes",
  "official", "oficial", "video", "audio", "lyrics", "lyric", "letra",
  "hd", "4k", "coros", "coro", "instrumental", "inst", "segunda", "voz",
  "version", "versión", "live", "vivo",
]);

function baseClean(value: string): string {
  return (value || "")
    .replace(/\uFFFD/g, " ")
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => token && !NOISE.has(token))
    .join(" ")
    .trim();
}

function cleanArtist(value: string): string {
  return baseClean(value)
    .replace(/\b(?:feat|featuring|ft)\b/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function cleanTitle(value: string): string {
  const stripped = (value || "")
    .replace(
      /\s*[-–—]\s*(?:lf\s+kar(?:a)?okes?|dj\s*sauly|dj\s*sa|rfk|club\s+karaoke|kk\s+live|banda|coros?|instrumental|segunda\s+voz|mujer|hombre|dueto|d[uú]o|en\s+vivo|ver\s+cuarteto)\b.*$/gi,
      " ",
    )
    .replace(/\b(?:lf\s+kar(?:a)?okes?|dj\s*sauly)\b/gi, " ");
  return baseClean(stripped);
}

function clean(value: string): string {
  return baseClean(value);
}

function keyFor(artist: string, title: string): string {
  return `${cleanArtist(artist)}::${cleanTitle(title)}`;
}

function tokenScore(a: string, b: string): number {
  const A = new Set(cleanTitle(a).split(" ").filter(Boolean));
  const B = new Set(cleanTitle(b).split(" ").filter(Boolean));
  if (!A.size || !B.size) return 0;
  let hits = 0;
  for (const token of A) if (B.has(token)) hits += 1;
  return (2 * hits) / (A.size + B.size);
}

function directionalCoverage(source: string, candidate: string): number {
  const A = new Set(cleanArtist(source).split(" ").filter(Boolean));
  const B = new Set(cleanArtist(candidate).split(" ").filter(Boolean));
  if (!A.size || !B.size) return 0;

  let sourceHits = 0;
  for (const token of A) if (B.has(token)) sourceHits += 1;

  let candidateHits = 0;
  for (const token of B) if (A.has(token)) candidateHits += 1;

  return Math.max(sourceHits / A.size, candidateHits / B.size);
}

function bigramScore(a: string, b: string): number {
  const left = cleanTitle(a);
  const right = cleanTitle(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.94;

  const pairs = (value: string) => {
    const compact = value.replace(/\s+/g, " ");
    const out: string[] = [];
    for (let i = 0; i < compact.length - 1; i += 1) out.push(compact.slice(i, i + 2));
    return out;
  };

  const A = pairs(left);
  const B = pairs(right);
  if (!A.length || !B.length) return 0;

  const counts = new Map<string, number>();
  for (const pair of A) counts.set(pair, (counts.get(pair) ?? 0) + 1);

  let overlap = 0;
  for (const pair of B) {
    const count = counts.get(pair) ?? 0;
    if (count > 0) {
      overlap += 1;
      counts.set(pair, count - 1);
    }
  }

  return (2 * overlap) / (A.length + B.length);
}

function titleSimilarity(a: string, b: string): number {
  return Math.max(tokenScore(a, b), directionalCoverage(a, b), bigramScore(a, b));
}

function scoreCandidate(sourceArtist: string, sourceTitle: string, artist: string, title: string): {
  score: number;
  titleScore: number;
  artistScore: number;
} {
  const titleScore = titleSimilarity(sourceTitle, title);
  const artistScore = directionalCoverage(sourceArtist, artist);
  const exactTitle = cleanTitle(sourceTitle) === cleanTitle(title) ? 0.22 : 0;

  return {
    titleScore,
    artistScore,
    score: Math.min(1, titleScore * 0.82 + artistScore * 0.18 + exactTitle),
  };
}

function acceptable(candidate: Candidate, sourceTitle: string): boolean {
  const normalizedTitle = cleanTitle(sourceTitle);
  const shortGeneric = normalizedTitle.split(" ").length === 1 && normalizedTitle.length <= 5;

  // Nivel A: título prácticamente idéntico. El artista confirma pero ya no bloquea
  // por nombres extendidos como "De Julio Aramburo La Bandononona".
  if (candidate.titleScore >= 0.92) {
    return shortGeneric ? candidate.artistScore >= 0.30 : true;
  }

  // Nivel B: título muy cercano. El artista ayuda, pero no bloquea nombres dañados
  // o extendidos cuando el título es suficientemente distintivo.
  if (candidate.titleScore >= 0.82) {
    return shortGeneric ? candidate.artistScore >= 0.30 : candidate.artistScore >= 0.05;
  }

  // Nivel C: matching agresivo para maximizar cobertura sin aceptar resultados aleatorios.
  if (candidate.titleScore >= 0.68 && candidate.artistScore >= 0.20) return true;

  if (candidate.titleScore >= 0.60 && candidate.artistScore >= 0.50) return true;

  return false;
}

function nowIso(): string {
  return new Date().toISOString();
}

function retryAfter(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

function isFresh(entry: CacheEntry): boolean {
  if (entry.status === "MATCHED") return true;
  if (!entry.retryAfter) return false;
  return new Date(entry.retryAfter).getTime() > Date.now();
}

export class CoverEnrichmentService {
  private readonly deezer = new DeezerPublicApi();
  private readonly cachePath: string;
  private cache: CacheDocument | null = null;
  private running = false;
  private drainPromise: Promise<void> | null = null;
  private startedAt: string | null = null;
  private completedAt: string | null = null;
  private lastError: string | null = null;

  constructor(
    private readonly db: Db,
    catalogJsonDir: string,
  ) {
    this.cachePath = `${catalogJsonDir.replace(/[\\/]$/, "")}/cover-provider-cache.json`;
  }

  private async loadCache(): Promise<CacheDocument> {
    if (this.cache) return this.cache;
    try {
      const parsed = JSON.parse(await readFile(this.cachePath, "utf8")) as CacheDocument;
      if (parsed?.version === 3 && parsed.entries) {
        this.cache = parsed;
        return parsed;
      }
    } catch {
      // First run: create an empty persistent cache.
    }
    this.cache = { version: 3, updatedAt: nowIso(), entries: {} };
    return this.cache;
  }

  private async saveCache(): Promise<void> {
    const cache = await this.loadCache();
    cache.updatedAt = nowIso();
    await mkdir(dirname(this.cachePath), { recursive: true });
    const tmp = `${this.cachePath}.tmp`;
    await writeFile(tmp, JSON.stringify(cache), "utf8");
    await rename(tmp, this.cachePath);
  }

  private async searchDeezer(artist: string, title: string): Promise<Candidate | null> {
    const cleanArtistValue = cleanArtist(artist);
    const cleanTitleValue = cleanTitle(title);
    const queries = [
      [cleanArtistValue, cleanTitleValue].filter(Boolean).join(" ").trim(),
      [cleanTitleValue, cleanArtistValue.split(" ").slice(0, 4).join(" ")].filter(Boolean).join(" ").trim(),
      cleanTitleValue,
    ].filter((query, index, all) => query && all.indexOf(query) === index);

    const candidates: Candidate[] = [];
    for (const query of queries) {
      const response = await this.deezer.search.track({ q: query, limit: 20 });
      const data = ((response as unknown as { data?: Array<any> }).data ?? []);
      for (const track of data) {
        const remoteTitle = String(track?.title_short ?? track?.title ?? "");
        const remoteArtist = String(track?.artist?.name ?? "");
        const coverUrl = String(track?.album?.cover_xl ?? track?.album?.cover_big ?? track?.album?.cover_medium ?? track?.album?.cover ?? "");
        if (!coverUrl) continue;
        const scores = scoreCandidate(artist, title, remoteArtist, remoteTitle);
        candidates.push({
          provider: "deezer",
          coverUrl,
          title: remoteTitle,
          artist: remoteArtist,
          ...scores,
        });
      }

      const bestNow = [...candidates].sort((a, b) => b.score - a.score)[0];
      if (bestNow && acceptable(bestNow, title) && bestNow.titleScore >= 0.90) return bestNow;
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates.find((candidate) => acceptable(candidate, title)) ?? null;
  }

  private async searchItunes(artist: string, title: string): Promise<Candidate | null> {
    const cleanArtistValue = cleanArtist(artist);
    const cleanTitleValue = cleanTitle(title);
    const terms = [
      [cleanArtistValue, cleanTitleValue].filter(Boolean).join(" ").trim(),
      [cleanTitleValue, cleanArtistValue.split(" ").slice(0, 4).join(" ")].filter(Boolean).join(" ").trim(),
      cleanTitleValue,
    ].filter((term, index, all) => term && all.indexOf(term) === index);

    const candidates: Candidate[] = [];
    for (const term of terms) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const url = `https://itunes.apple.com/search?entity=song&limit=20&term=${encodeURIComponent(term)}`;
        const response = await fetch(url, {
          headers: { Accept: "application/json", "User-Agent": "DJGABO-Actualizaciones-PRO/1.0" },
          signal: controller.signal,
        });
        if (!response.ok) continue;
        const payload = await response.json() as {
          results?: Array<{
            trackName?: string;
            artistName?: string;
            artworkUrl100?: string;
          }>;
        };

        for (const track of payload.results ?? []) {
          const remoteTitle = track.trackName ?? "";
          const remoteArtist = track.artistName ?? "";
          const coverUrl = (track.artworkUrl100 ?? "").replace(/100x100bb/, "600x600bb");
          if (!coverUrl) continue;
          const scores = scoreCandidate(artist, title, remoteArtist, remoteTitle);
          candidates.push({
            provider: "itunes",
            coverUrl,
            title: remoteTitle,
            artist: remoteArtist,
            ...scores,
          });
        }

        const bestNow = [...candidates].sort((a, b) => b.score - a.score)[0];
        if (bestNow && acceptable(bestNow, title) && bestNow.titleScore >= 0.90) return bestNow;
      } finally {
        clearTimeout(timeout);
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates.find((candidate) => acceptable(candidate, title)) ?? null;
  }

  private async resolveCover(artist: string, title: string): Promise<Candidate | null> {
    // Deezer wrapper first: it already includes its own rate-limit queue.
    const deezer = await this.searchDeezer(artist, title).catch(() => null);
    if (deezer) return deezer;

    // music-utils style provider fallback: a miss in one provider is not final.
    return this.searchItunes(artist, title).catch(() => null);
  }

  private async applyCachedMatch(karaokeId: string, collectionId: string, coverUrl: string): Promise<void> {
    await this.db.update(karaokes).set({ coverUrl }).where(and(eq(karaokes.id, karaokeId), isNull(karaokes.coverUrl)));
    await this.db
      .update(collections)
      .set({ coverUrl })
      .where(and(eq(collections.id, collectionId), isNull(collections.coverUrl)));
  }

  async runBatch(limit = DEFAULT_BATCH_SIZE, concurrency = DEFAULT_CONCURRENCY): Promise<CoverEnrichmentRunResult> {
    if (this.running) return { checked: 0, matched: 0, noMatch: 0, errors: 0 };
    this.running = true;
    this.startedAt ??= nowIso();
    this.lastError = null;

    try {
      const cache = await this.loadCache();
      const rows = await this.db
        .select({
          id: karaokes.id,
          artist: karaokes.artist,
          title: karaokes.title,
          collectionId: karaokes.collectionId,
        })
        .from(karaokes)
        .innerJoin(collections, eq(karaokes.collectionId, collections.id))
        .where(isNull(karaokes.coverUrl))
        .orderBy(desc(collections.year), desc(collections.month), desc(karaokes.createdAt));

      const queue = rows.filter((row) => {
        const entry = cache.entries[keyFor(row.artist, row.title)];
        return !entry || !isFresh(entry);
      }).slice(0, Math.max(1, limit));

      let matched = 0;
      let noMatch = 0;
      let errors = 0;

      for (let offset = 0; offset < queue.length; offset += concurrency) {
        const chunk = queue.slice(offset, offset + concurrency);
        const results = await Promise.all(chunk.map(async (row) => {
          const key = keyFor(row.artist, row.title);
          try {
            const candidate = await this.resolveCover(row.artist, row.title);
            if (!candidate) {
              cache.entries[key] = {
                status: "NO_MATCH",
                provider: null,
                coverUrl: null,
                score: null,
                checkedAt: nowIso(),
                retryAfter: retryAfter(NO_MATCH_TTL_MS),
              };
              return { kind: "NO_MATCH" as const, row };
            }

            cache.entries[key] = {
              status: "MATCHED",
              provider: candidate.provider,
              coverUrl: candidate.coverUrl,
              score: Number(candidate.score.toFixed(3)),
              checkedAt: nowIso(),
              retryAfter: null,
              providerTitle: candidate.title,
              providerArtist: candidate.artist,
            };
            await this.applyCachedMatch(row.id, row.collectionId, candidate.coverUrl);
            return { kind: "MATCHED" as const, row };
          } catch (error) {
            cache.entries[key] = {
              status: "ERROR",
              provider: null,
              coverUrl: null,
              score: null,
              checkedAt: nowIso(),
              retryAfter: retryAfter(ERROR_TTL_MS),
            };
            this.lastError = error instanceof Error ? error.message : String(error);
            return { kind: "ERROR" as const, row };
          }
        }));

        for (const result of results) {
          if (result.kind === "MATCHED") matched += 1;
          else if (result.kind === "NO_MATCH") noMatch += 1;
          else errors += 1;
        }
        await this.saveCache();
      }

      return { checked: queue.length, matched, noMatch, errors };
    } finally {
      this.running = false;
    }
  }

  startDrain(onMatched?: () => Promise<void>): void {
    if (this.drainPromise) return;
    this.completedAt = null;
    this.startedAt = nowIso();

    this.drainPromise = (async () => {
      try {
        while (true) {
          const result = await this.runBatch();
          if (result.matched > 0 && onMatched) await onMatched();

          const status = await this.getStatus();
          if (status.pending === 0) {
            this.completedAt = nowIso();
            break;
          }

          // If nothing was eligible because misses/errors are cooling down,
          // this pass is complete. Future sync/manual retry can revisit them.
          if (result.checked === 0) {
            this.completedAt = nowIso();
            break;
          }

          await new Promise((resolve) => setTimeout(resolve, BETWEEN_BATCHES_MS));
        }
      } catch (error) {
        this.lastError = error instanceof Error ? error.message : String(error);
      } finally {
        this.drainPromise = null;
      }
    })();
  }

  async getStatus(): Promise<CoverEnrichmentStatus> {
    const cache = await this.loadCache();
    const rows = await this.db
      .select({
        artist: karaokes.artist,
        title: karaokes.title,
        coverUrl: karaokes.coverUrl,
      })
      .from(karaokes);

    let withCover = 0;
    let matchedFromCache = 0;
    let noMatch = 0;
    let errors = 0;
    let pending = 0;

    for (const row of rows) {
      if (row.coverUrl) {
        withCover += 1;
        const entry = cache.entries[keyFor(row.artist, row.title)];
        if (entry?.status === "MATCHED") matchedFromCache += 1;
        continue;
      }

      const entry = cache.entries[keyFor(row.artist, row.title)];
      if (!entry || !isFresh(entry)) pending += 1;
      else if (entry.status === "NO_MATCH") noMatch += 1;
      else if (entry.status === "ERROR") errors += 1;
      else pending += 1;
    }

    return {
      running: this.running || Boolean(this.drainPromise),
      total: rows.length,
      withCover,
      matchedFromCache,
      noMatch,
      errors,
      pending,
      complete: pending === 0 && errors === 0,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      lastError: this.lastError,
    };
  }

  async retryMisses(): Promise<void> {
    const cache = await this.loadCache();
    for (const entry of Object.values(cache.entries)) {
      if (entry.status === "NO_MATCH" || entry.status === "ERROR") {
        entry.retryAfter = new Date(0).toISOString();
      }
    }
    await this.saveCache();
  }
}
