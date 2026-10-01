import type { FastifyInstance } from "fastify";
import { Readable } from "node:stream";
import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { BatchStrategy } from "@djgabo/shared";
import type { TemporaryUrlDTO } from "@djgabo/shared";
import { parseMonthFolder, parseYearFolder } from "@djgabo/storage";
import { resolveVerifiedDeviceId } from "./deviceTokenGuard.js";
import { signDownloadTicket, verifyDownloadTicket } from "../auth/downloadTicket.js";
import { assets, collections, deviceSessions, downloadLogs, karaokes } from "../db/schema.js";
import { createId } from "../db/id.js";

const batchBodySchema = z.object({
  strategy: z.nativeEnum(BatchStrategy).default(BatchStrategy.MULTI_FILE),
});

const reasonToStatus: Record<string, number> = {
  USER_NOT_FOUND: 401,
  USER_SUSPENDED: 403,
  USER_EXPIRED: 403,
  COLLECTION_NOT_FOUND: 404,
  COLLECTION_INACTIVE: 403,
  ACCESS_NOT_GRANTED: 403,
  ACCESS_DISABLED: 403,
  ACCESS_EXPIRED: 403,
  DEVICE_LIMIT_REACHED: 409,
  DEVICE_TOKEN_REQUIRED: 401,
  DEVICE_TOKEN_INVALID: 401,
  KARAOKE_NOT_FOUND: 404,
  ASSET_NOT_AVAILABLE: 404,
  ARCHIVE_NOT_AVAILABLE: 404,
};

/**
 * Nunca se devuelve storageKey, path físico ni el link permanente de
 * Dropbox: solo URLs temporales de vida corta (punto 17).
 *
 * El deviceId YA NO viene del body: se deriva del header `X-Device-Token`,
 * firmado por el servidor en /api/devices/register (punto 5). Si falta o es
 * inválido, la descarga se rechaza — no hay forma de "saltarse" el límite
 * de dispositivos omitiendo el campo.
 */
function safeFileName(value: string): string {
  return value.replace(/[\r\n"]/g, "_").trim() || "descarga";
}

function deriveCollectionFolder(year: number, month: number, storageKey: string): string | null {
  const segments = storageKey.split("/").filter(Boolean);
  if (segments.length < 2) return null;

  if (month === 0) {
    const yearIndex = segments.findIndex((segment) => parseYearFolder(segment) === year);
    return yearIndex >= 0 ? `/${segments.slice(0, yearIndex + 1).join("/")}` : null;
  }

  let monthIndex = segments.findIndex(
    (segment) => parseYearFolder(segment) === year && parseMonthFolder(segment) === month,
  );

  if (monthIndex < 0) {
    const yearIndex = segments.findIndex((segment) => parseYearFolder(segment) === year);
    if (yearIndex >= 0) {
      for (let i = yearIndex + 1; i < segments.length - 1; i++) {
        const segment = segments[i];
        if (segment && parseMonthFolder(segment) === month) {
          monthIndex = i;
          break;
        }
      }
    }
  }

  return monthIndex >= 0 ? `/${segments.slice(0, monthIndex + 1).join("/")}` : null;
}

async function activeDevice(db: FastifyInstance["db"], userId: string, deviceId: string): Promise<boolean> {
  const session = await db.query.deviceSessions.findFirst({
    where: and(
      eq(deviceSessions.userId, userId),
      eq(deviceSessions.deviceId, deviceId),
      eq(deviceSessions.active, true),
    ),
  });
  return Boolean(session);
}

export async function registerDownloadsRoutes(fastify: FastifyInstance) {
  const { env, db } = fastify;

  fastify.post<{ Params: { id: string } }>(
    "/api/downloads/karaoke/:id",
    {
      preHandler: fastify.authenticate,
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const deviceResolution = await resolveVerifiedDeviceId(request, env, db);
      if (!deviceResolution.ok) {
        const status = reasonToStatus[deviceResolution.reason] ?? 401;
        return reply.code(status).send({ error: deviceResolution.reason, message: describeReason(deviceResolution.reason), statusCode: status });
      }

      const result = await fastify.downloadService.downloadKaraoke(request.authUser!.sub, request.params.id, {
        deviceId: deviceResolution.deviceId,
        ip: request.ip,
      });
      if (!result.ok) {
        const status = reasonToStatus[result.reason] ?? 403;
        return reply.code(status).send({ error: result.reason, message: describeReason(result.reason), statusCode: status });
      }
      const dto: TemporaryUrlDTO = {
        url: result.url,
        expiresAt: result.expiresAt?.toISOString() ?? null,
        type: "MASTER",
        fileName: result.fileName,
        mimeType: result.mimeType,
      };
      return reply.send(dto);
    },
  );

  fastify.post<{ Params: { id: string } }>(
    "/api/downloads/collection/:id",
    {
      preHandler: fastify.authenticate,
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const parsed = batchBodySchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: "INVALID_INPUT", message: "Parámetros inválidos", statusCode: 400 });
      }
      const deviceResolution = await resolveVerifiedDeviceId(request, env, db);
      if (!deviceResolution.ok) {
        const status = reasonToStatus[deviceResolution.reason] ?? 401;
        return reply.code(status).send({ error: deviceResolution.reason, message: describeReason(deviceResolution.reason), statusCode: status });
      }

      const result = await fastify.batchDownloadService.downloadCollection(
        request.authUser!.sub,
        request.params.id,
        parsed.data.strategy,
        { deviceId: deviceResolution.deviceId, ip: request.ip },
      );
      if (!result.ok) {
        const status = reasonToStatus[result.reason] ?? 403;
        return reply.code(status).send({ error: result.reason, message: describeReason(result.reason), statusCode: status });
      }
      return reply.send(result);
    },
  );
  fastify.post<{ Params: { id: string } }>(
    "/api/downloads/karaoke/:id/ticket",
    {
      preHandler: fastify.authenticate,
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const deviceResolution = await resolveVerifiedDeviceId(request, env, db);
      if (!deviceResolution.ok) {
        const status = reasonToStatus[deviceResolution.reason] ?? 401;
        return reply.code(status).send({ error: deviceResolution.reason, message: describeReason(deviceResolution.reason), statusCode: status });
      }

      const check = await fastify.authorizationService.canDownloadKaraoke(
        request.authUser!.sub,
        request.params.id,
        deviceResolution.deviceId,
      );
      if (!check.allowed) {
        const status = reasonToStatus[check.reason ?? "FORBIDDEN"] ?? 403;
        return reply.code(status).send({ error: check.reason ?? "FORBIDDEN", message: describeReason(check.reason ?? "FORBIDDEN"), statusCode: status });
      }

      const ticket = signDownloadTicket(env, {
        sub: request.authUser!.sub,
        deviceId: deviceResolution.deviceId,
        kind: "KARAOKE",
        resourceId: request.params.id,
        jti: crypto.randomUUID(),
      });

      return reply.send({
        downloadPath: `/api/downloads/secure/${ticket}`,
        expiresInSeconds: 90,
      });
    },
  );

  fastify.post<{ Params: { id: string } }>(
    "/api/downloads/collection/:id/ticket",
    {
      preHandler: fastify.authenticate,
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const deviceResolution = await resolveVerifiedDeviceId(request, env, db);
      if (!deviceResolution.ok) {
        const status = reasonToStatus[deviceResolution.reason] ?? 401;
        return reply.code(status).send({ error: deviceResolution.reason, message: describeReason(deviceResolution.reason), statusCode: status });
      }

      const check = await fastify.authorizationService.canDownloadCollection(
        request.authUser!.sub,
        request.params.id,
        deviceResolution.deviceId,
      );
      if (!check.allowed) {
        const status = reasonToStatus[check.reason ?? "FORBIDDEN"] ?? 403;
        return reply.code(status).send({ error: check.reason ?? "FORBIDDEN", message: describeReason(check.reason ?? "FORBIDDEN"), statusCode: status });
      }

      const collection = await db.query.collections.findFirst({ where: eq(collections.id, request.params.id) });
      if (!collection) {
        return reply.code(404).send({ error: "COLLECTION_NOT_FOUND", message: describeReason("COLLECTION_NOT_FOUND"), statusCode: 404 });
      }

      const ticket = signDownloadTicket(env, {
        sub: request.authUser!.sub,
        deviceId: deviceResolution.deviceId,
        kind: "COLLECTION_ZIP",
        resourceId: collection.id,
        jti: crypto.randomUUID(),
      });

      return reply.send({
        downloadPath: `/api/downloads/secure/${ticket}`,
        expiresInSeconds: 90,
      });
    },
  );

  /**
   * Gateway de descarga nativa:
   * - el navegador solo ve Railway;
   * - Dropbox se consulta server-side;
   * - no se escribe el archivo en disco;
   * - el ticket dura 90s y la autorización se vuelve a validar al iniciar.
   */
  fastify.get<{ Params: { token: string } }>(
    "/api/downloads/secure/:token",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request, reply) => {
      let ticket;
      try {
        ticket = verifyDownloadTicket(env, request.params.token);
      } catch {
        return reply.code(401).send({ error: "DOWNLOAD_TICKET_INVALID", message: "El enlace de descarga venció o no es válido.", statusCode: 401 });
      }

      if (!(await activeDevice(db, ticket.sub, ticket.deviceId))) {
        return reply.code(401).send({ error: "DEVICE_TOKEN_INVALID", message: describeReason("DEVICE_TOKEN_INVALID"), statusCode: 401 });
      }

      reply.header("Cache-Control", "no-store");
      reply.header("X-Content-Type-Options", "nosniff");

      try {
        if (ticket.kind === "KARAOKE") {
          const check = await fastify.authorizationService.canDownloadKaraoke(ticket.sub, ticket.resourceId, ticket.deviceId);
          if (!check.allowed) {
            const status = reasonToStatus[check.reason ?? "FORBIDDEN"] ?? 403;
            return reply.code(status).send({ error: check.reason ?? "FORBIDDEN", message: describeReason(check.reason ?? "FORBIDDEN"), statusCode: status });
          }

          const karaoke = await db.query.karaokes.findFirst({ where: eq(karaokes.id, ticket.resourceId) });
          if (!karaoke?.masterAssetId) {
            return reply.code(404).send({ error: "ASSET_NOT_AVAILABLE", message: describeReason("ASSET_NOT_AVAILABLE"), statusCode: 404 });
          }
          const asset = await db.query.assets.findFirst({ where: eq(assets.id, karaoke.masterAssetId) });
          if (!asset) {
            return reply.code(404).send({ error: "ASSET_NOT_AVAILABLE", message: describeReason("ASSET_NOT_AVAILABLE"), statusCode: 404 });
          }

          const download = await fastify.storageService.getSecureFileStream(asset.storageKey);
          await db.insert(downloadLogs).values({
            id: createId("dl"),
            userId: ticket.sub,
            karaokeId: karaoke.id,
            collectionId: karaoke.collectionId,
            assetId: asset.id,
            type: "KARAOKE",
            ip: request.ip,
            deviceId: ticket.deviceId,
            createdAt: new Date(),
          });

          reply.header("Content-Type", download.contentType);
          reply.header("Content-Disposition", `attachment; filename="${safeFileName(asset.fileName)}"`);
          if (download.contentLength !== null && Number.isFinite(download.contentLength)) {
            reply.header("Content-Length", String(download.contentLength));
          }
          return reply.send(Readable.fromWeb(download.body as never));
        }

        const check = await fastify.authorizationService.canDownloadCollection(ticket.sub, ticket.resourceId, ticket.deviceId);
        if (!check.allowed) {
          const status = reasonToStatus[check.reason ?? "FORBIDDEN"] ?? 403;
          return reply.code(status).send({ error: check.reason ?? "FORBIDDEN", message: describeReason(check.reason ?? "FORBIDDEN"), statusCode: status });
        }

        const collection = await db.query.collections.findFirst({ where: eq(collections.id, ticket.resourceId) });
        if (!collection) {
          return reply.code(404).send({ error: "COLLECTION_NOT_FOUND", message: describeReason("COLLECTION_NOT_FOUND"), statusCode: 404 });
        }

        const firstKaraoke = await db.query.karaokes.findFirst({
          where: eq(karaokes.collectionId, collection.id),
          with: { masterAsset: true },
        });
        const storageKey = firstKaraoke?.masterAsset?.storageKey;
        if (!storageKey) {
          return reply.code(404).send({ error: "ASSET_NOT_AVAILABLE", message: describeReason("ASSET_NOT_AVAILABLE"), statusCode: 404 });
        }

        const folderKey = deriveCollectionFolder(collection.year, collection.month, storageKey);
        if (!folderKey) {
          return reply.code(409).send({ error: "COLLECTION_PATH_UNRESOLVED", message: "No se pudo resolver la carpeta real de esta colección.", statusCode: 409 });
        }

        const download = await fastify.storageService.getSecureFolderZipStream(folderKey);
        await db.insert(downloadLogs).values({
          id: createId("dl"),
          userId: ticket.sub,
          collectionId: collection.id,
          type: "COLLECTION_ARCHIVE",
          ip: request.ip,
          deviceId: ticket.deviceId,
          createdAt: new Date(),
        });

        reply.header("Content-Type", "application/zip");
        reply.header("Content-Disposition", `attachment; filename="${safeFileName(collection.title)}.zip"`);
        if (download.contentLength !== null && Number.isFinite(download.contentLength)) {
          reply.header("Content-Length", String(download.contentLength));
        }
        return reply.send(Readable.fromWeb(download.body as never));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/too_large|too many|too_many_files/i.test(message)) {
          return reply.code(413).send({
            error: "COLLECTION_TOO_LARGE",
            message: "Esta carpeta supera el límite de descarga ZIP directa y requiere descarga por partes.",
            statusCode: 413,
          });
        }
        throw error;
      }
    },
  );
}

function describeReason(reason: string): string {
  const messages: Record<string, string> = {
    USER_SUSPENDED: "Tu cuenta está suspendida.",
    USER_EXPIRED: "Tu membresía ha vencido.",
    COLLECTION_INACTIVE: "Esta colección no está disponible.",
    ACCESS_NOT_GRANTED: "No tienes acceso a esta colección.",
    ACCESS_DISABLED: "Tu acceso a esta colección fue desactivado.",
    ACCESS_EXPIRED: "Tu acceso a esta colección venció.",
    DEVICE_LIMIT_REACHED: "Alcanzaste el límite de dispositivos de tu plan.",
    DEVICE_TOKEN_REQUIRED: "Falta registrar este dispositivo antes de descargar.",
    DEVICE_TOKEN_INVALID: "El dispositivo no es válido o fue desactivado. Vuelve a registrarlo.",
    KARAOKE_NOT_FOUND: "Karaoke no encontrado.",
    ASSET_NOT_AVAILABLE: "El archivo todavía no está disponible.",
    ARCHIVE_NOT_AVAILABLE: "El ZIP de esta colección todavía no está armado. Usa la descarga por archivos individuales.",
    COLLECTION_NOT_FOUND: "Colección no encontrada.",
  };
  return messages[reason] ?? "No se pudo completar la operación.";
}
