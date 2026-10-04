import { Readable } from "node:stream";
import { spawn } from "node:child_process";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { assets, collections, karaokes } from "../db/schema.js";
import { deriveSourceGroup } from "../services/sourceGroup.js";
import { signDemoTicket, verifyDemoTicket } from "../auth/demoTicket.js";
import {
  DEMO_PLAYER_QUALITIES,
  type DemoPlayerSettings,
} from "../services/DemoPlayerSettingsService.js";

const settingsSchema = z.object({
  enabled: z.boolean(),
  startSeconds: z.number().int().min(0).max(600),
  durationSeconds: z.number().int().min(15).max(90),
  quality: z.enum(DEMO_PLAYER_QUALITIES),
});

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_./-]+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function isClubKaraokeSource(group: string | null): boolean {
  if (!group) return false;
  const value = normalize(group);
  return value.includes("club karaoke") || value.includes("el club karaoke") || value.includes("prod club");
}

function replaceExtension(path: string, extension: string): string {
  const slash = path.lastIndexOf("/");
  const dot = path.lastIndexOf(".");
  const base = dot > slash ? path.slice(0, dot) : path;
  return `${base}.${extension}`;
}

type DemoMedia =
  | {
      ok: true;
      karaoke: typeof karaokes.$inferSelect;
      collection: typeof collections.$inferSelect;
      audioAsset: typeof assets.$inferSelect;
      audioKey: string;
      cdgKey: string;
      settings: DemoPlayerSettings;
    }
  | { ok: false; status: number; error: string; message: string };

async function resolveDemoMedia(
  fastify: FastifyInstance,
  userId: string,
  karaokeId: string,
  options: { requireCdg?: boolean } = {},
): Promise<DemoMedia> {
  const settings = await fastify.demoPlayerSettingsService.get();
  if (!settings.enabled) {
    return { ok: false, status: 403, error: "DEMO_DISABLED", message: "Los demos están desactivados." };
  }

  const karaoke = await fastify.db.query.karaokes.findFirst({ where: (k, { eq }) => eq(k.id, karaokeId) });
  if (!karaoke) {
    return { ok: false, status: 404, error: "KARAOKE_NOT_FOUND", message: "Karaoke no encontrado." };
  }

  const access = await fastify.authorizationService.canAccessCollection(userId, karaoke.collectionId);
  if (!access.allowed) {
    return { ok: false, status: 403, error: access.reason ?? "FORBIDDEN", message: "No tienes acceso a esta colección." };
  }

  const collection = await fastify.db.query.collections.findFirst({ where: (c, { eq }) => eq(c.id, karaoke.collectionId) });
  if (!collection || !karaoke.masterAssetId) {
    return { ok: false, status: 404, error: "ASSET_NOT_AVAILABLE", message: "El karaoke no tiene audio disponible." };
  }

  const audioAsset = await fastify.db.query.assets.findFirst({ where: (a, { eq }) => eq(a.id, karaoke.masterAssetId!) });
  if (!audioAsset) {
    return { ok: false, status: 404, error: "ASSET_NOT_AVAILABLE", message: "El karaoke no tiene audio disponible." };
  }

  let audioKey = audioAsset.storageKey;
  if (audioAsset.providerFileId) {
    try {
      audioKey = await fastify.storageService.getCurrentPathForProviderFileId(audioAsset.providerFileId);
    } catch {
      // El storageKey indexado sigue siendo un fallback válido.
    }
  }

  const group = deriveSourceGroup(audioKey, collection.storagePath);
  if (!isClubKaraokeSource(group)) {
    return {
      ok: false,
      status: 403,
      error: "DEMO_NOT_ALLOWED_FOR_SOURCE",
      message: "El demo solo está disponible para Club Karaoke.",
    };
  }

  let cdgKey = replaceExtension(audioKey, "cdg");
  if (options.requireCdg !== false) {
    let exists = await fastify.storageService.exists(cdgKey);
    if (!exists) {
      const upper = replaceExtension(audioKey, "CDG");
      exists = await fastify.storageService.exists(upper);
      if (exists) cdgKey = upper;
    }
    if (!exists) {
      return {
        ok: false,
        status: 404,
        error: "CDG_NOT_AVAILABLE",
        message: "No se encontró el archivo CDG asociado a este karaoke.",
      };
    }
  }

  return { ok: true, karaoke, collection, audioAsset, audioKey, cdgKey, settings };
}

export async function registerDemoPlayerRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/api/demo-player/settings",
    { preHandler: fastify.authenticate },
    async (_request, reply) => reply.send(await fastify.demoPlayerSettingsService.get()),
  );

  fastify.get<{ Params: { id: string } }>(
    "/api/preview/cdg/:id/config",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const resolved = await resolveDemoMedia(fastify, request.authUser!.sub, request.params.id);
      if (!resolved.ok) return reply.code(resolved.status).send(resolved);

      return reply.send({
        karaokeId: resolved.karaoke.id,
        title: resolved.karaoke.title,
        artist: resolved.karaoke.artist,
        startSeconds: 0,
        sourceStartSeconds: resolved.settings.startSeconds,
        durationSeconds: resolved.settings.durationSeconds,
        quality: resolved.settings.quality,
        ...(() => {
          const ticket = signDemoTicket(fastify.env, {
            sub: request.authUser!.sub,
            resourceId: resolved.karaoke.id,
          });
          const encoded = encodeURIComponent(ticket);
          return {
            audioUrl: `/api/preview/cdg/${resolved.karaoke.id}/audio?ticket=${encoded}`,
            cdgUrl: `/api/preview/cdg/${resolved.karaoke.id}/cdg?ticket=${encoded}`,
          };
        })(),
      });
    },
  );

  fastify.get<{ Params: { id: string }; Querystring: { ticket?: string } }>(
    "/api/preview/cdg/:id/cdg",
    { config: { rateLimit: { max: 40, timeWindow: "1 minute" } } },
    async (request, reply) => {
      let ticket;
      try {
        ticket = verifyDemoTicket(fastify.env, request.query.ticket ?? "");
      } catch {
        return reply.code(401).send({ error: "DEMO_TICKET_INVALID", message: "El demo venció. Ábrelo nuevamente.", statusCode: 401 });
      }
      if (ticket.resourceId !== request.params.id) {
        return reply.code(401).send({ error: "DEMO_TICKET_INVALID", message: "El demo no corresponde a este karaoke.", statusCode: 401 });
      }

      const resolved = await resolveDemoMedia(fastify, ticket.sub, request.params.id);
      if (!resolved.ok) return reply.code(resolved.status).send(resolved);

      const stream = await fastify.storageService.getSecureFileStream(resolved.cdgKey);
      reply.header("Content-Type", "application/octet-stream");
      reply.header("Cache-Control", "private, max-age=300");
      reply.header("X-Content-Type-Options", "nosniff");
      if (stream.contentLength !== null) reply.header("Content-Length", String(stream.contentLength));
      return reply.send(Readable.fromWeb(stream.body as never));
    },
  );

  fastify.get<{ Params: { id: string }; Querystring: { ticket?: string } }>(
    "/api/preview/cdg/:id/audio",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
      let ticket;
      try {
        ticket = verifyDemoTicket(fastify.env, request.query.ticket ?? "");
      } catch {
        return reply.code(401).send({ error: "DEMO_TICKET_INVALID", message: "El demo venció. Ábrelo nuevamente.", statusCode: 401 });
      }
      if (ticket.resourceId !== request.params.id) {
        return reply.code(401).send({ error: "DEMO_TICKET_INVALID", message: "El demo no corresponde a este karaoke.", statusCode: 401 });
      }

      const resolved = await resolveDemoMedia(
        fastify,
        ticket.sub,
        request.params.id,
        { requireCdg: false },
      );
      if (!resolved.ok) return reply.code(resolved.status).send(resolved);

      // Seguridad: el navegador NUNCA recibe el master completo. Dropbox se
      // transmite a ffmpeg por stdin y solo se devuelve el intervalo aprobado
      // por Admin. Aunque alguien copie este endpoint, solo obtiene el demo.
      const source = await fastify.storageService.getSecureFileStream(resolved.audioKey);
      const input = Readable.fromWeb(source.body as never);
      const ffmpeg = spawn(
        "ffmpeg",
        [
          "-hide_banner",
          "-loglevel", "error",
          "-i", "pipe:0",
          "-ss", String(resolved.settings.startSeconds),
          "-t", String(resolved.settings.durationSeconds),
          "-vn",
          "-map_metadata", "-1",
          "-ac", "2",
          "-ar", "44100",
          "-c:a", "libmp3lame",
          "-b:a", "160k",
          "-f", "mp3",
          "pipe:1",
        ],
        { stdio: ["pipe", "pipe", "pipe"] },
      );

      let stderr = "";
      const chunks: Buffer[] = [];
      ffmpeg.stderr.on("data", (chunk) => {
        if (stderr.length < 4000) stderr += String(chunk);
      });
      ffmpeg.stdout.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));

      input.on("error", () => ffmpeg.stdin.destroy());
      ffmpeg.stdin.on("error", () => input.destroy());
      input.pipe(ffmpeg.stdin);

      const output = await new Promise<Buffer>((resolve, reject) => {
        ffmpeg.once("error", reject);
        ffmpeg.once("close", (code) => {
          input.destroy();
          if (code === 0) {
            resolve(Buffer.concat(chunks));
            return;
          }
          request.log.warn({ code, stderr: stderr.slice(-1000) }, "ffmpeg demo preview failed");
          reject(new Error("DEMO_TRANSCODE_FAILED"));
        });
      });

      reply.header("Content-Type", "audio/mpeg");
      reply.header("Content-Length", String(output.length));
      reply.header("Cache-Control", "private, no-store");
      reply.header("Accept-Ranges", "none");
      reply.header("X-Content-Type-Options", "nosniff");
      return reply.send(output);
    },
  );

  const adminGuard = { preHandler: [fastify.authenticate, fastify.requireRole("ADMIN")] };

  fastify.get("/api/admin/demo-player-settings", adminGuard, async (_request, reply) => {
    return reply.send(await fastify.demoPlayerSettingsService.get());
  });

  fastify.put("/api/admin/demo-player-settings", adminGuard, async (request, reply) => {
    const parsed = settingsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "INVALID_INPUT",
        message: "Configuración del demo inválida.",
        statusCode: 400,
      });
    }
    return reply.send(await fastify.demoPlayerSettingsService.update(parsed.data));
  });

  fastify.get("/api/admin/demo-player-settings/sample", adminGuard, async (_request, reply) => {
    const candidates = await fastify.db.query.karaokes.findMany({
      orderBy: (k, { desc }) => desc(k.createdAt),
      limit: 1000,
      with: { masterAsset: true, collection: true },
    });

    for (const candidate of candidates) {
      if (!candidate.masterAsset || !candidate.collection) continue;
      const group = deriveSourceGroup(candidate.masterAsset.storageKey, candidate.collection.storagePath);
      if (!isClubKaraokeSource(group)) continue;

      const cdgLower = replaceExtension(candidate.masterAsset.storageKey, "cdg");
      const cdgUpper = replaceExtension(candidate.masterAsset.storageKey, "CDG");
      if (!(await fastify.storageService.exists(cdgLower)) && !(await fastify.storageService.exists(cdgUpper))) {
        continue;
      }

      return reply.send({
        karaokeId: candidate.id,
        title: candidate.title,
        artist: candidate.artist,
      });
    }

    return reply.code(404).send({
      error: "SAMPLE_NOT_FOUND",
      message: "No se encontró un karaoke de Club Karaoke con CDG disponible.",
      statusCode: 404,
    });
  });
}
