import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { users } from "../db/schema.js";

export type KaraokeRequestStatus = "REQUESTED" | "IN_PROGRESS" | "READY" | "REJECTED";

export interface KaraokeRequestRecord {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  youtubeUrl: string;
  videoId: string | null;
  sourceTitle: string | null;
  sourceAuthor: string | null;
  status: KaraokeRequestStatus;
  matchedKaraokeId: string | null;
  matchedCollectionId: string | null;
  matchedCollectionTitle: string | null;
  createdAt: string;
  updatedAt: string;
  readyAt: string | null;
}

interface YoutubeMetadata {
  videoId: string | null;
  title: string | null;
  author: string | null;
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(official|oficial|video|audio|lyrics?|letra|hd|4k|karaoke)\b/g, " ")
    .replace(/[()[\]{}|_/\\:;,.!?'"“”‘’´`~+*=<>-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractVideoId(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] ?? null;
    if (host === "youtube.com" || host.endsWith(".youtube.com")) {
      if (url.pathname === "/watch") return url.searchParams.get("v");
      const parts = url.pathname.split("/").filter(Boolean);
      if (["shorts", "embed", "live"].includes(parts[0] ?? "")) return parts[1] ?? null;
    }
  } catch {
    return null;
  }
  return null;
}

async function readYoutubeMetadata(rawUrl: string): Promise<YoutubeMetadata> {
  const videoId = extractVideoId(rawUrl);
  if (!videoId) return { videoId: null, title: null, author: null };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(rawUrl)}&format=json`,
      { signal: controller.signal },
    );
    if (!response.ok) return { videoId, title: null, author: null };
    const data = await response.json() as { title?: string; author_name?: string };
    return {
      videoId,
      title: typeof data.title === "string" ? data.title : null,
      author: typeof data.author_name === "string" ? data.author_name : null,
    };
  } catch {
    return { videoId, title: null, author: null };
  } finally {
    clearTimeout(timer);
  }
}

export class KaraokeRequestService {
  constructor(private readonly db: Db, private readonly filePath: string) {}

  private async readAll(): Promise<KaraokeRequestRecord[]> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  private async writeAll(items: KaraokeRequestRecord[]): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temp = `${this.filePath}.tmp`;
    await writeFile(temp, JSON.stringify(items, null, 2), "utf8");
    await writeFile(this.filePath, JSON.stringify(items, null, 2), "utf8");
    try {
      const { unlink } = await import("node:fs/promises");
      await unlink(temp);
    } catch {
      // El archivo principal ya quedó persistido.
    }
  }

  private async findCatalogMatch(title: string | null, author: string | null) {
    if (!title) return null;
    const source = normalize(title);
    const sourceAuthor = normalize(author ?? "");
    if (source.length < 5) return null;

    const all = await this.db.query.karaokes.findMany({
      with: { collection: true },
    });

    let best: { karaoke: typeof all[number]; score: number } | null = null;
    for (const karaoke of all) {
      const titleKey = normalize(karaoke.title);
      const artistKey = normalize(karaoke.artist);
      if (titleKey.length < 3) continue;

      let score = 0;
      if (source.includes(titleKey)) score += 3;
      if (artistKey.length >= 3 && source.includes(artistKey)) score += 3;
      if (artistKey.length >= 3 && sourceAuthor.includes(artistKey)) score += 2;

      const combinedA = normalize(`${karaoke.artist} ${karaoke.title}`);
      const combinedB = normalize(`${karaoke.title} ${karaoke.artist}`);
      if (source.includes(combinedA) || source.includes(combinedB)) score += 5;

      if (score >= 5 && (!best || score > best.score)) best = { karaoke, score };
    }

    if (!best?.karaoke.collection) return null;
    return {
      karaokeId: best.karaoke.id,
      title: best.karaoke.title,
      artist: best.karaoke.artist,
      collectionId: best.karaoke.collection.id,
      collectionTitle: best.karaoke.collection.title,
      year: best.karaoke.collection.year,
      month: best.karaoke.collection.month,
    };
  }

  async create(userId: string, youtubeUrl: string) {
    const user = await this.db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) throw new Error("USER_NOT_FOUND");

    const meta = await readYoutubeMetadata(youtubeUrl);
    if (!meta.videoId) throw new Error("INVALID_YOUTUBE_URL");

    const existingMatch = await this.findCatalogMatch(meta.title, meta.author);
    if (existingMatch) {
      return { alreadyAvailable: true as const, match: existingMatch };
    }

    const items = await this.readAll();
    const duplicate = items.find(
      (item) =>
        item.userId === userId &&
        item.videoId === meta.videoId &&
        item.status !== "REJECTED",
    );
    if (duplicate) return { alreadyAvailable: false as const, duplicate: true as const, request: duplicate };

    const now = new Date().toISOString();
    const record: KaraokeRequestRecord = {
      id: `req_${randomUUID()}`,
      userId,
      userEmail: user.email,
      userName: user.name,
      youtubeUrl,
      videoId: meta.videoId,
      sourceTitle: meta.title,
      sourceAuthor: meta.author,
      status: "REQUESTED",
      matchedKaraokeId: null,
      matchedCollectionId: null,
      matchedCollectionTitle: null,
      createdAt: now,
      updatedAt: now,
      readyAt: null,
    };
    items.unshift(record);
    await this.writeAll(items);
    return { alreadyAvailable: false as const, duplicate: false as const, request: record };
  }

  async reconcile(): Promise<KaraokeRequestRecord[]> {
    const items = await this.readAll();
    let changed = false;
    for (const item of items) {
      if (item.status === "READY" || item.status === "REJECTED") continue;
      const match = await this.findCatalogMatch(item.sourceTitle, item.sourceAuthor);
      if (!match) continue;
      item.status = "READY";
      item.matchedKaraokeId = match.karaokeId;
      item.matchedCollectionId = match.collectionId;
      item.matchedCollectionTitle = match.collectionTitle;
      item.updatedAt = new Date().toISOString();
      item.readyAt = item.updatedAt;
      changed = true;
    }
    if (changed) await this.writeAll(items);
    return items;
  }

  async listForUser(userId: string): Promise<KaraokeRequestRecord[]> {
    const items = await this.reconcile();
    return items.filter((item) => item.userId === userId);
  }

  async listAll(): Promise<KaraokeRequestRecord[]> {
    return this.reconcile();
  }

  async updateStatus(id: string, status: KaraokeRequestStatus): Promise<KaraokeRequestRecord | null> {
    const items = await this.readAll();
    const item = items.find((candidate) => candidate.id === id);
    if (!item) return null;
    item.status = status;
    item.updatedAt = new Date().toISOString();
    if (status !== "READY") {
      item.readyAt = null;
      if (status === "REJECTED") {
        item.matchedKaraokeId = null;
        item.matchedCollectionId = null;
        item.matchedCollectionTitle = null;
      }
    }
    await this.writeAll(items);
    return item;
  }
}
