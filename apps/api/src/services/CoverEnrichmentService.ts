import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { and, eq, isNull } from "drizzle-orm";
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
  version: 1;
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
const DEFAULT_BATCH_SIZE = 40;
const DEFAULT_CONCURRENCY = 4;
const BETWEEN_BATCHES_MS = 800;
const REQUEST_TIMEOUT_MS = 5000;

const NOISE = new Set([
  "karaoke", "official", "oficial", "video", "audio", "lyrics", "lyric", "letra",
  "hd", "4k", "coros", "coro", "instrumental", "inst", "segunda", "voz",
  "version", "versión", "live", "vivo",
]);

function clean(value: string): string {
  return (value || "")
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

function keyFor(artist: string, title: string): string {
  return `${clean(artist)}::${clean(title)}`;
}

function tokenScore(a: string, b: string): number {
  const A = new Set(clean(a).split(" ").filter(Boolean));
  const B = new Set(clean(b).split(" ").filter(Boolean));
  if (!A.size || !B.size) return 0;
  let hits = 0;
  for (const token of A) if (B.has(token)) hits += 1;
  return (2 * hits) / (A.size + B.size);
}

function scoreCandidate(sourceArtist: string, sourceTitle: string, artist: string, title: string): {
  score: number;
  titleScore: number;
  artistScore: number;
} {
  const titleScore = tokenScore(sourceTitle, title);
  const artistScore = tokenScore(sourceArtist, artist);
  const exactTitle = clean(sourceTitle) === clean(title) ? 0.14 : 0;
  return {
    titleScore,
    artistScore,
    score: Math.min(1, titleScore * 0.76 + artistScore * 0.24 + exactTitle),
  };
}

function acceptable(candidate: Candidate, sourceTitle: string): boolean {
  if (candidate.score < 0.40 || candidate.titleScore < 0.45) return false;
  const normalizedTitle = clean(sourceTitle);
  if (normalizedTitle.split(" ").length === 1 && normalizedTitle.length <= 5) {
    return candidate.artistScore >= 0.45;
  }
  return true;
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
      if (parsed?.version === 1 && parsed.entries) {
        this.cache = parsed;
        return parsed;
      }
    } catch {
      // First run: create an empty persistent cache.
    }
    this.cache = { version: 1, updatedAt: nowIso(), entries: {} };
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
    const query = [artist, title].filter(Boolean).join(" ").trim();
    const response = await this.deezer.search.track({ q: query, limit: 10 });
    const data = ((response as unknown as { data?: Array<any> }).data ?? []);
    const candidates: Candidate[] = data
      .map((track) => {
        const remoteTitle = String(track?.title_short ?? track?.title ?? "");
        const remoteArtist = String(track?.artist?.name ?? "");
        const coverUrl = String(track?.album?.cover_big ?? track?.album?.cover_medium ?? track?.album?.cover ?? "");
        if (!coverUrl) return null;
        const scores = scoreCandidate(artist, title, remoteArtist, remoteTitle);
        return {
          provider: "deezer" as const,
          coverUrl,
          title: remoteTitle,
          artist: remoteArtist,
          ...scores,
        };
      })
      .filter(Boolean) as Candidate[];

    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0] ?? null;
    return best && acceptable(best, title) ? best : null;
  }

  private async searchItunes(artist: string, title: string): Promise<Candidate | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const term = [artist, title].filter(Boolean).join(" ").trim();
      const url = `https://itunes.apple.com/search?entity=song&limit=10&term=${encodeURIComponent(term)}`;
      const response = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "DJGABO-Actualizaciones-PRO/1.0" },
        signal: controller.signal,
      });
      if (!response.ok) return null;
      const payload = await response.json() as {
        results?: Array<{
          trackName?: string;
          artistName?: string;
          artworkUrl100?: string;
        }>;
      };
      const candidates: Candidate[] = (payload.results ?? [])
        .map((track) => {
          const remoteTitle = track.trackName ?? "";
          const remoteArtist = track.artistName ?? "";
          const coverUrl = (track.artworkUrl100 ?? "").replace(/100x100bb/, "600x600bb");
          if (!coverUrl) return null;
          const scores = scoreCandidate(artist, title, remoteArtist, remoteTitle);
          return {
            provider: "itunes" as const,
            coverUrl,
            title: remoteTitle,
            artist: remoteArtist,
            ...scores,
          };
        })
        .filter(Boolean) as Candidate[];

      candidates.sort((a, b) => b.score - a.score);
      const best = candidates[0] ?? null;
      return best && acceptable(best, title) ? best : null;
    } finally {
      clearTimeout(timeout);
    }
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
        .where(isNull(karaokes.coverUrl));

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
