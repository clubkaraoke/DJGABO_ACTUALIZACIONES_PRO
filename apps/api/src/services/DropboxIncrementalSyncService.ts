import { and, eq } from "drizzle-orm";
import {
  DropboxStorageProvider,
  StorageIndexerService,
  parseMonthFolder,
  parseYearFolder,
  type DropboxChangeEntry,
} from "@djgabo/storage";
import type { Db } from "../db/client.js";
import { createId } from "../db/id.js";
import { syncState } from "../db/schema.js";
import { DrizzleIndexerRepository } from "../db/drizzleIndexerRepository.js";
import type { Env } from "../env.js";
import { CatalogJsonService } from "./CatalogJsonService.js";
import { SheetMirrorService } from "./SheetMirrorService.js";

interface MonthTarget {
  path: string;
  year: number;
  month: number;
}

/**
 * Dropbox webhook -> cursor delta -> indexación solo de meses afectados ->
 * JSON atómico -> Sheet mirror -> avance de cursor.
 *
 * Es deliberadamente idempotente: el cursor se persiste al FINAL. Si algo
 * falla antes, el mismo delta se reintenta en el siguiente webhook.
 */
export class DropboxIncrementalSyncService {
  private running = false;
  private pending = false;

  constructor(
    private readonly db: Db,
    private readonly provider: DropboxStorageProvider,
    private readonly env: Env,
    private readonly catalog: CatalogJsonService,
    private readonly sheetMirror: SheetMirrorService,
    private readonly log: {
      info: (obj: unknown, msg?: string) => void;
      warn: (obj: unknown, msg?: string) => void;
      error: (obj: unknown, msg?: string) => void;
    },
  ) {}

  async ensureCursor(): Promise<string> {
    const existing = await this.getState();
    if (existing) return existing.cursor;

    // Snapshot del estado actual: desde este punto todos los cambios futuros
    // llegarán como deltas. El catálogo inicial se publica por separado.
    const cursor = await this.provider.getLatestCursor(this.env.SYNC_ROOT_PATH);
    const now = new Date();
    await this.db.insert(syncState).values({
      id: createId("sst"),
      provider: "dropbox",
      rootPath: this.env.SYNC_ROOT_PATH,
      cursor,
      initializedAt: now,
      updatedAt: now,
    });
    this.log.info({ rootPath: this.env.SYNC_ROOT_PATH }, "Dropbox incremental cursor initialized");
    return cursor;
  }

  trigger(): void {
    this.pending = true;
    if (this.running) return;

    this.running = true;
    void this.drain()
      .catch((error) => this.log.error({ err: error }, "Dropbox incremental sync failed"))
      .finally(() => {
        this.running = false;
        // Si llegó otro webhook justo entre el fin del loop y el finally.
        if (this.pending) this.trigger();
      });
  }

  async runNow(): Promise<{ processed: number; months: MonthTarget[]; version?: string }> {
    await this.ensureCursor();
    return this.runDelta();
  }

  private async drain(): Promise<void> {
    while (this.pending) {
      this.pending = false;
      await this.runDelta();
    }
  }

  private async runDelta(): Promise<{ processed: number; months: MonthTarget[]; version?: string }> {
    const state = await this.getState();
    if (!state) throw new Error("Dropbox cursor no inicializado");

    const delta = await this.provider.listChanges(state.cursor);
    if (delta.entries.length === 0) {
      await this.persistCursor(delta.cursor);
      return { processed: 0, months: [] };
    }

    const targets = this.deriveMonthTargets(delta.entries);
    let version: string | undefined;

    if (targets.length > 0) {
      const repo = new DrizzleIndexerRepository(this.db, "dropbox");
      const indexer = new StorageIndexerService(this.provider, repo);
      const result = await indexer.runMonths(targets, { dryRun: false });
      if (result.errorCount > 0) {
        throw new Error(`Incremental indexer terminó con ${result.errorCount} errores`);
      }

      const versionDoc = await this.catalog.publishMonths(targets);
      version = versionDoc.version;

      await this.sheetMirror.publish({
        source: "dropbox",
        synced_at: new Date().toISOString(),
        version: versionDoc.version,
        months: targets.map(({ year, month }) => ({ year, month })),
        changes: delta.entries.map((entry) => ({
          path: entry.path,
          name: entry.name,
          kind: entry.kind,
          ...(entry.providerFileId ? { provider_file_id: entry.providerFileId } : {}),
          ...(typeof entry.size === "number" ? { size: entry.size } : {}),
          ...(entry.modifiedAt ? { modified_at: entry.modifiedAt.toISOString() } : {}),
        })),
      });
    }

    await this.persistCursor(delta.cursor);
    this.log.info(
      { processed: delta.entries.length, months: targets.length, version },
      "Dropbox incremental sync completed",
    );

    return { processed: delta.entries.length, months: targets, version };
  }

  private deriveMonthTargets(entries: DropboxChangeEntry[]): MonthTarget[] {
    const root = this.env.SYNC_ROOT_PATH.replace(/\/$/, "").toLowerCase();
    const byMonth = new Map<string, MonthTarget>();

    for (const entry of entries) {
      const lower = entry.path.toLowerCase();
      if (!lower.startsWith(root)) continue;

      const relative = entry.path.slice(this.env.SYNC_ROOT_PATH.replace(/\/$/, "").length);
      const segments = relative.split("/").filter(Boolean);
      if (segments.length < 2) continue;

      const yearSegment = segments[0];
      const monthSegment = segments[1];
      if (!yearSegment || !monthSegment) continue;

      const year = parseYearFolder(yearSegment);
      const month = parseMonthFolder(monthSegment);
      if (year === null || month === null) continue;

      const monthPath = `${this.env.SYNC_ROOT_PATH.replace(/\/$/, "")}/${yearSegment}/${monthSegment}`;
      byMonth.set(`${year}-${month}`, { path: monthPath, year, month });
    }

    return [...byMonth.values()];
  }

  private async getState() {
    return this.db.query.syncState.findFirst({
      where: and(eq(syncState.provider, "dropbox"), eq(syncState.rootPath, this.env.SYNC_ROOT_PATH)),
    });
  }

  private async persistCursor(cursor: string): Promise<void> {
    await this.db
      .update(syncState)
      .set({ cursor, updatedAt: new Date() })
      .where(and(eq(syncState.provider, "dropbox"), eq(syncState.rootPath, this.env.SYNC_ROOT_PATH)));
  }
}
