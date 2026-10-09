import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface VipMigrationRecord {
  userId: string;
  email: string;
  whatsapp: string;
  registeredAt: string;
}

export class VipMigrationService {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  private async readAll(): Promise<VipMigrationRecord[]> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  async findByUserId(userId: string): Promise<VipMigrationRecord | null> {
    const items = await this.readAll();
    return items.find((item) => item.userId === userId) ?? null;
  }

  async save(record: VipMigrationRecord): Promise<void> {
    this.writeQueue = this.writeQueue.then(async () => {
      const items = await this.readAll();
      const next = items.filter((item) => item.userId !== record.userId);
      next.push(record);
      await mkdir(dirname(this.filePath), { recursive: true });
      const tempPath = `${this.filePath}.tmp`;
      await writeFile(tempPath, JSON.stringify(next, null, 2), "utf8");
      await rename(tempPath, this.filePath);
    });
    await this.writeQueue;
  }
}
