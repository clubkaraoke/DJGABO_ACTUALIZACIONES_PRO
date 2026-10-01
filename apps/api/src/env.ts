import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().default(30),
  DEVICE_TOKEN_SECRET: z.string().min(16),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  STORAGE_PROVIDER: z.enum(["mock", "dropbox"]).default("mock"),
  DROPBOX_APP_KEY: z.string().optional(),
  DROPBOX_APP_SECRET: z.string().optional(),
  DROPBOX_REFRESH_TOKEN: z.string().optional(),
  DROPBOX_ROOT_PATH: z.string().default("/ACTUALIZACIONES"),
  SYNC_ROOT_PATH: z.string().default("/ACTUALIZACIONES"),
  CATALOG_JSON_DIR: z.string().default("./data/catalog"),
  DROPBOX_WEBHOOK_DEBOUNCE_MS: z.coerce.number().int().min(500).max(60000).default(5000),
  SHEET_SYNC_WEBHOOK_URL: z.string().url().optional(),
  SHEET_SYNC_WEBHOOK_SECRET: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    console.error("❌ Variables de entorno inválidas:", parsed.error.flatten().fieldErrors);
    throw new Error("Configuración de entorno inválida. Revisa tu archivo .env contra .env.example");
  }
  return parsed.data;
}
