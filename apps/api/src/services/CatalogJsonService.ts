import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { and, asc, desc, eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { assets, collections, karaokes } from "../db/schema.js";

export interface CatalogVersionDocument {
  schema_version: 1;
  version: string;
  updated_at: string;
  years: number[];
}

interface CatalogKaraoke {
  id: string;
  code: string;
  artist: string;
  title: string;
  format: string | null;
  size: number | null;
  cover_url: string | null;
  brand: string;
}

interface CatalogMonthDocument {
  schema_version: 1;
  version: string;
  updated_at: string;
  year: number;
  month: number;
  collection: {
    id: string;
    slug: string;
    title: string;
    cover_url: string | null;
    active: boolean;
  } | null;
  brands: Array<{ name: string; slug: string; count: number }>;
  karaokes: CatalogKaraoke[];
}

/**
 * Publica el catálogo web como JSON sin rutas privadas de Dropbox.
 *
 * - Escritura atómica: archivo .tmp -> rename.
 * - version.json es diminuto y sirve para polling/revalidación en Base44.
 * - Cada mes vive en su propio JSON para no descargar todo el catálogo.
 * - El Sheet puede seguir siendo auditoría/maestro humano; la web consume JSON.
 */
export class CatalogJsonService {
  constructor(
    private readonly db: Db,
    private readonly rootDir: string,
  ) {}

  async publishAll(): Promise<CatalogVersionDocument> {
    const rows = await this.db.query.collections.findMany({
      orderBy: [desc(collections.year), desc(collections.month)],
    });
    const months = rows.map((c) => ({ year: c.year, month: c.month }));
    return this.publishMonths(months);
  }

  async publishMonths(targets: Array<{ year: number; month: number }>): Promise<CatalogVersionDocument> {
    const unique = new Map<string, { year: number; month: number }>();
    for (const target of targets) unique.set(`${target.year}-${target.month}`, target);

    const now = new Date();
    const version = `${now.getTime()}`;

    for (const target of unique.values()) {
      const doc = await this.buildMonthDocument(target.year, target.month, version, now);
      await this.atomicWriteJson(this.monthPath(target.year, target.month), doc);
    }

    const yearsRows = await this.db
      .select({ year: collections.year })
      .from(collections)
      .orderBy(desc(collections.year));
    const years = [...new Set(yearsRows.map((r) => r.year))];

    const versionDoc: CatalogVersionDocument = {
      schema_version: 1,
      version,
      updated_at: now.toISOString(),
      years,
    };

    await this.atomicWriteJson(this.versionPath(), versionDoc);
    return versionDoc;
  }

  async readVersion(): Promise<{ doc: CatalogVersionDocument; etag: string }> {
    const raw = await readFile(this.versionPath(), "utf8");
    return { doc: JSON.parse(raw) as CatalogVersionDocument, etag: this.etag(raw) };
  }

  async readMonth(year: number, month: number): Promise<{ doc: CatalogMonthDocument; etag: string }> {
    const raw = await readFile(this.monthPath(year, month), "utf8");
    return { doc: JSON.parse(raw) as CatalogMonthDocument, etag: this.etag(raw) };
  }

  private async buildMonthDocument(
    year: number,
    month: number,
    version: string,
    now: Date,
  ): Promise<CatalogMonthDocument> {
    const collection = await this.db.query.collections.findFirst({
      where: (c, { and, eq: equals }) => and(equals(c.year, year), equals(c.month, month)),
    });

    if (!collection) {
      return {
        schema_version: 1,
        version,
        updated_at: now.toISOString(),
        year,
        month,
        collection: null,
        brands: [],
        karaokes: [],
      };
    }

    const rows = await this.db
      .select({
        id: karaokes.id,
        code: karaokes.code,
        artist: karaokes.artist,
        title: karaokes.title,
        format: karaokes.format,
        size: karaokes.size,
        coverUrl: karaokes.coverUrl,
        storageKey: assets.storageKey,
        fileName: assets.fileName,
      })
      .from(karaokes)
      .leftJoin(assets, eq(karaokes.masterAssetId, assets.id))
      .where(
        and(
          eq(karaokes.collectionId, collection.id),
          eq(assets.provider, "dropbox"),
        ),
      )
      .orderBy(asc(karaokes.artist), asc(karaokes.title));

    const karaokesOut: CatalogKaraoke[] = rows.map((row) => {
      const brand = this.deriveBrand(collection.storagePath, row.storageKey ?? "");
      return {
        id: row.id,
        code: row.code,
        artist: row.artist,
        title: row.title,
        format: row.format ?? this.extensionOf(row.fileName ?? ""),
        size: row.size,
        cover_url: row.coverUrl,
        brand,
      };
    });

    const counts = new Map<string, number>();
    for (const karaoke of karaokesOut) {
      counts.set(karaoke.brand, (counts.get(karaoke.brand) ?? 0) + 1);
    }

    const brands = [...counts.entries()]
      .map(([name, count]) => ({ name, slug: this.slug(name), count }))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));

    return {
      schema_version: 1,
      version,
      updated_at: now.toISOString(),
      year,
      month,
      collection: {
        id: collection.id,
        slug: collection.slug,
        title: collection.title,
        cover_url: collection.coverUrl,
        active: collection.active,
      },
      brands,
      karaokes: karaokesOut,
    };
  }

  private deriveBrand(monthPath: string, storageKey: string): string {
    const normalizedMonth = monthPath.replace(/\/$/, "");
    if (!storageKey.startsWith(normalizedMonth)) return "DJGABO";
    const relative = storageKey.slice(normalizedMonth.length).replace(/^\/+/, "");
    const parts = relative.split("/").filter(Boolean);
    if (parts.length <= 1) return "DJGABO";
    const brandPart = parts[0];
    if (!brandPart) return "DJGABO";
    return brandPart.replace(/^\d+[._ -]*/, "").replace(/[_]+/g, " ").trim() || "DJGABO";
  }

  private extensionOf(fileName: string): string | null {
    const idx = fileName.lastIndexOf(".");
    return idx >= 0 ? fileName.slice(idx + 1).toUpperCase() : null;
  }

  private slug(value: string): string {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  private versionPath(): string {
    return join(this.rootDir, "version.json");
  }

  private monthPath(year: number, month: number): string {
    return join(this.rootDir, String(year), String(month).padStart(2, "0"), "index.json");
  }

  private async atomicWriteJson(path: string, value: unknown): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    const body = JSON.stringify(value);
    const tmp = `${path}.${process.pid}.tmp`;
    await writeFile(tmp, body, "utf8");
    await rename(tmp, path);
  }

  private etag(raw: string): string {
    return `"${createHash("sha256").update(raw).digest("hex")}"`;
  }
}
