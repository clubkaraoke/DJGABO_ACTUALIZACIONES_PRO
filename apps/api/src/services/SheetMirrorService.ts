export interface SheetMirrorPayload {
  source: "dropbox";
  synced_at: string;
  version: string;
  months: Array<{ year: number; month: number }>;
  changes: Array<{
    path: string;
    name: string;
    kind: "file" | "folder" | "deleted";
    provider_file_id?: string;
    size?: number;
    modified_at?: string;
  }>;
  snapshots?: Array<{
    year: number;
    month: number;
    month_path: string;
    files: Array<{
      path: string;
      name: string;
      size?: number;
      modified_at?: string;
      provider_file_id?: string;
    }>;
  }>;
}

/**
 * Puente opcional hacia Google Sheets.
 *
 * La URL apunta a un Google Apps Script Web App (o gateway equivalente) que
 * escribe en 01_MAESTRO_PORTAL_ACTUALIZACIONES_PRO. El backend no guarda
 * credenciales de Google en el navegador ni las expone al cliente.
 */
export class SheetMirrorService {
  constructor(
    private readonly webhookUrl?: string,
    private readonly secret?: string,
  ) {}

  get enabled(): boolean {
    return Boolean(this.webhookUrl);
  }

  async publish(payload: SheetMirrorPayload): Promise<void> {
    if (!this.webhookUrl) return;

    const res = await fetch(this.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.secret ? { Authorization: `Bearer ${this.secret}` } : {}),
      },
      body: JSON.stringify({
        ...payload,
        ...(this.secret ? { secret: this.secret } : {}),
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Sheet mirror respondió ${res.status}: ${body.slice(0, 300)}`);
    }
  }
}
