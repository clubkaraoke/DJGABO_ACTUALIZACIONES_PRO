import type { FastifyInstance } from "fastify";
import { Readable } from "node:stream";
import crypto from "node:crypto";
import { and, eq, gte, isNull } from "drizzle-orm";
import { parseMonthFolder, parseYearFolder } from "@djgabo/storage";
import { resolveVerifiedDeviceId } from "./deviceTokenGuard.js";
import { signDownloadTicket, verifyDownloadTicket } from "../auth/downloadTicket.js";
import {
  assets,
  collections,
  deviceSessions,
  downloadLogs,
  downloadTickets,
  karaokes,
  plans,
  userDownloadCollections,
  users,
} from "../db/schema.js";
import { createId } from "../db/id.js";

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
  COLLECTION_DAILY_LIMIT_REACHED: 429,
  DAILY_DISTINCT_COLLECTION_LIMIT_REACHED: 429,
  COLLECTION_SELECTION_LIMIT_REACHED: 403,
  DOWNLOAD_ALREADY_PREPARING: 409,
  DOWNLOAD_TICKET_INVALID: 401,
  DOWNLOAD_TICKET_USED: 410,
};

interface DownloadPolicyState {
  maxPerCollectionPerDay: number;
  maxDistinctCollectionsPerDay: number;
  maxSelectedCollections: number | null;
  downloadsForCollectionToday: number;
  distinctCollectionsToday: number;
  selectedCollections: number;
  isSelected: boolean;
}

const PERU_OFFSET_MS = 5 * 60 * 60 * 1000;

function startOfPeruDay(now = new Date()): Date {
  const limaClock = new Date(now.getTime() - PERU_OFFSET_MS);
  limaClock.setUTCHours(0, 0, 0, 0);
  return new Date(limaClock.getTime() + PERU_OFFSET_MS);
}

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

async function getPolicyState(
  db: FastifyInstance["db"],
  userId: string,
  collectionId: string,
  now = new Date(),
): Promise<DownloadPolicyState> {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  const plan = user?.planId
    ? await db.query.plans.findFirst({ where: eq(plans.id, user.planId) })
    : null;

  const maxPerCollectionPerDay = plan?.maxCollectionDownloadsPerDay ?? 2;
  const maxDistinctCollectionsPerDay = plan?.maxDistinctCollectionsPerDay ?? 5;
  const maxSelectedCollections = plan?.maxSelectedCollections ?? null;
  const dayStart = startOfPeruDay(now);

  const todayLogs = await db.query.downloadLogs.findMany({
    where: and(
      eq(downloadLogs.userId, userId),
      eq(downloadLogs.type, "COLLECTION_ARCHIVE"),
      gte(downloadLogs.createdAt, dayStart),
    ),
  });

  const downloadsForCollectionToday = todayLogs.filter((l) => l.collectionId === collectionId).length;
  const distinctCollectionsToday = new Set(todayLogs.map((l) => l.collectionId).filter(Boolean)).size;

  const selected = await db.query.userDownloadCollections.findMany({
    where: eq(userDownloadCollections.userId, userId),
  });
  const isSelected = selected.some((x) => x.collectionId === collectionId);

  return {
    maxPerCollectionPerDay,
    maxDistinctCollectionsPerDay,
    maxSelectedCollections,
    downloadsForCollectionToday,
    distinctCollectionsToday,
    selectedCollections: selected.length,
    isSelected,
  };
}

function policyDenial(state: DownloadPolicyState): string | null {
  if (
    state.maxSelectedCollections !== null &&
    !state.isSelected &&
    state.selectedCollections >= state.maxSelectedCollections
  ) {
    return "COLLECTION_SELECTION_LIMIT_REACHED";
  }

  if (state.downloadsForCollectionToday >= state.maxPerCollectionPerDay) {
    return "COLLECTION_DAILY_LIMIT_REACHED";
  }

  if (
    state.downloadsForCollectionToday === 0 &&
    state.distinctCollectionsToday >= state.maxDistinctCollectionsPerDay
  ) {
    return "DAILY_DISTINCT_COLLECTION_LIMIT_REACHED";
  }

  return null;
}

async function rejectRecentDuplicateTicket(
  db: FastifyInstance["db"],
  userId: string,
  deviceId: string,
  kind: "KARAOKE" | "COLLECTION_ZIP",
  resourceId: string,
): Promise<boolean> {
  const recent = await db.query.downloadTickets.findFirst({
    where: and(
      eq(downloadTickets.userId, userId),
      eq(downloadTickets.deviceId, deviceId),
      eq(downloadTickets.kind, kind),
      eq(downloadTickets.resourceId, resourceId),
      isNull(downloadTickets.consumedAt),
      gte(downloadTickets.createdAt, new Date(Date.now() - 10_000)),
    ),
  });
  return Boolean(recent);
}

async function persistTicket(
  db: FastifyInstance["db"],
  env: FastifyInstance["env"],
  payload: {
    sub: string;
    deviceId: string;
    kind: "KARAOKE" | "COLLECTION_ZIP";
    resourceId: string;
  },
) {
  const jti = crypto.randomUUID();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 90_000);
  const token = signDownloadTicket(env, { ...payload, jti });

  await db.insert(downloadTickets).values({
    id: jti,
    userId: payload.sub,
    deviceId: payload.deviceId,
    kind: payload.kind,
    resourceId: payload.resourceId,
    createdAt,
    expiresAt,
  });

  return { token, expiresAt };
}

async function validatePersistedTicket(
  db: FastifyInstance["db"],
  ticket: ReturnType<typeof verifyDownloadTicket>,
) {
  if (!ticket.jti) return { ok: false as const, reason: "DOWNLOAD_TICKET_INVALID" };

  const row = await db.query.downloadTickets.findFirst({ where: eq(downloadTickets.id, ticket.jti) });
  if (
    !row ||
    row.userId !== ticket.sub ||
    row.deviceId !== ticket.deviceId ||
    row.kind !== ticket.kind ||
    row.resourceId !== ticket.resourceId ||
    row.expiresAt.getTime() < Date.now()
  ) {
    return { ok: false as const, reason: "DOWNLOAD_TICKET_INVALID" };
  }
  if (row.consumedAt) return { ok: false as const, reason: "DOWNLOAD_TICKET_USED" };
  return { ok: true as const, row };
}

export async function registerDownloadsRoutes(fastify: FastifyInstance) {
  const { env, db } = fastify;

  /**
   * Endpoints antiguos que devolvían links temporales de Dropbox.
   * Se mantienen solo para dar un error claro a clientes desactualizados.
   * Las descargas nuevas SIEMPRE usan ticket + gateway seguro.
   */
  fastify.post("/api/downloads/karaoke/:id", async (_request, reply) => {
    return reply.code(410).send({
      error: "SECURE_DOWNLOAD_REQUIRED",
      message: "Usa el flujo seguro de descarga.",
      statusCode: 410,
    });
  });

  fastify.post("/api/downloads/collection/:id", async (_request, reply) => {
    return reply.code(410).send({
      error: "SECURE_DOWNLOAD_REQUIRED",
      message: "Usa el flujo seguro de descarga.",
      statusCode: 410,
    });
  });

  fastify.get<{ Params: { id: string } }>(
    "/api/downloads/collection/:id/status",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const check = await fastify.authorizationService.canAccessCollection(request.authUser!.sub, request.params.id);
      if (!check.allowed) {
        const status = reasonToStatus[check.reason ?? "FORBIDDEN"] ?? 403;
        return reply.code(status).send({
          error: check.reason ?? "FORBIDDEN",
          message: describeReason(check.reason ?? "FORBIDDEN"),
          statusCode: status,
        });
      }

      const state = await getPolicyState(db, request.authUser!.sub, request.params.id);
      const denial = policyDenial(state);
      return reply.send({
        canDownload: !denial,
        denialReason: denial,
        timezone: "America/Lima",
        downloadsToday: state.downloadsForCollectionToday,
        maxDownloadsPerDay: state.maxPerCollectionPerDay,
        distinctCollectionsToday: state.distinctCollectionsToday,
        maxDistinctCollectionsPerDay: state.maxDistinctCollectionsPerDay,
        selected: state.isSelected,
        selectedCollections: state.selectedCollections,
        maxSelectedCollections: state.maxSelectedCollections,
      });
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

      if (await rejectRecentDuplicateTicket(db, request.authUser!.sub, deviceResolution.deviceId, "KARAOKE", request.params.id)) {
        return reply.code(409).send({
          error: "DOWNLOAD_ALREADY_PREPARING",
          message: describeReason("DOWNLOAD_ALREADY_PREPARING"),
          statusCode: 409,
        });
      }

      const { token, expiresAt } = await persistTicket(db, env, {
        sub: request.authUser!.sub,
        deviceId: deviceResolution.deviceId,
        kind: "KARAOKE",
        resourceId: request.params.id,
      });

      return reply.send({
        downloadPath: `/api/downloads/secure/${token}`,
        expiresAt: expiresAt.toISOString(),
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

      const state = await getPolicyState(db, request.authUser!.sub, collection.id);
      const denial = policyDenial(state);
      if (denial) {
        const status = reasonToStatus[denial] ?? 403;
        return reply.code(status).send({ error: denial, message: describeReason(denial), statusCode: status });
      }

      if (await rejectRecentDuplicateTicket(db, request.authUser!.sub, deviceResolution.deviceId, "COLLECTION_ZIP", collection.id)) {
        return reply.code(409).send({
          error: "DOWNLOAD_ALREADY_PREPARING",
          message: describeReason("DOWNLOAD_ALREADY_PREPARING"),
          statusCode: 409,
        });
      }

      const { token, expiresAt } = await persistTicket(db, env, {
        sub: request.authUser!.sub,
        deviceId: deviceResolution.deviceId,
        kind: "COLLECTION_ZIP",
        resourceId: collection.id,
      });

      return reply.send({
        downloadPath: `/api/downloads/secure/${token}`,
        expiresAt: expiresAt.toISOString(),
        expiresInSeconds: 90,
      });
    },
  );

  /**
   * Gateway seguro:
   * - ticket de inicio de un solo uso (90 s);
   * - ligado a usuario + dispositivo + recurso;
   * - se revalida plan/acceso al iniciar;
   * - Dropbox nunca se expone al navegador;
   * - el archivo se transmite y no se guarda en Railway.
   */
  fastify.get<{ Params: { token: string } }>(
    "/api/downloads/secure/:token",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request, reply) => {
      let ticket;
      try {
        ticket = verifyDownloadTicket(env, request.params.token);
      } catch {
        return reply.code(401).send({ error: "DOWNLOAD_TICKET_INVALID", message: describeReason("DOWNLOAD_TICKET_INVALID"), statusCode: 401 });
      }

      const persisted = await validatePersistedTicket(db, ticket);
      if (!persisted.ok) {
        const status = reasonToStatus[persisted.reason] ?? 401;
        return reply.code(status).send({ error: persisted.reason, message: describeReason(persisted.reason), statusCode: status });
      }

      if (!(await activeDevice(db, ticket.sub, ticket.deviceId))) {
        return reply.code(401).send({ error: "DEVICE_TOKEN_INVALID", message: describeReason("DEVICE_TOKEN_INVALID"), statusCode: 401 });
      }

      reply.header("Cache-Control", "no-store");
      reply.header("X-Content-Type-Options", "nosniff");
      reply.header("Referrer-Policy", "no-referrer");

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

        const consumeResult = await db
          .update(downloadTickets)
          .set({ consumedAt: new Date() })
          .where(and(eq(downloadTickets.id, persisted.row.id), isNull(downloadTickets.consumedAt)));
        if ((consumeResult as { changes?: number }).changes === 0) {
          return reply.code(410).send({ error: "DOWNLOAD_TICKET_USED", message: describeReason("DOWNLOAD_TICKET_USED"), statusCode: 410 });
        }

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

      const state = await getPolicyState(db, ticket.sub, collection.id);
      const denial = policyDenial(state);
      if (denial) {
        const status = reasonToStatus[denial] ?? 403;
        return reply.code(status).send({ error: denial, message: describeReason(denial), statusCode: status });
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

      let download;
      try {
        download = await fastify.storageService.getSecureFolderZipStream(folderKey);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/too_large|too many|too_many_files/i.test(message)) {
          return reply.code(413).send({
            error: "COLLECTION_TOO_LARGE",
            message: "Esta carpeta supera el límite de descarga ZIP directa. Descárgala por partes.",
            statusCode: 413,
          });
        }
        throw error;
      }

      // El ticket se consume únicamente cuando Dropbox ya aceptó preparar el flujo.
      const consumeResult = await db
        .update(downloadTickets)
        .set({ consumedAt: new Date() })
        .where(and(eq(downloadTickets.id, persisted.row.id), isNull(downloadTickets.consumedAt)));
      if ((consumeResult as { changes?: number }).changes === 0) {
        return reply.code(410).send({ error: "DOWNLOAD_TICKET_USED", message: describeReason("DOWNLOAD_TICKET_USED"), statusCode: 410 });
      }

      if (state.maxSelectedCollections !== null && !state.isSelected) {
        await db.insert(userDownloadCollections).values({
          id: createId("sel"),
          userId: ticket.sub,
          collectionId: collection.id,
          selectedAt: new Date(),
        }).onConflictDoNothing();
      }

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
    COLLECTION_NOT_FOUND: "Colección no encontrada.",
    COLLECTION_DAILY_LIMIT_REACHED: "Ya utilizaste las 2 descargas disponibles hoy para esta carpeta. Podrás descargarla nuevamente mañana.",
    DAILY_DISTINCT_COLLECTION_LIMIT_REACHED: "Ya alcanzaste el máximo de carpetas diferentes que puedes descargar hoy.",
    COLLECTION_SELECTION_LIMIT_REACHED: "Ya utilizaste todas las carpetas incluidas en tu plan.",
    DOWNLOAD_ALREADY_PREPARING: "Esta descarga ya se está preparando. Espera unos segundos antes de intentarlo otra vez.",
    DOWNLOAD_TICKET_INVALID: "El enlace de descarga venció o no es válido. Solicita uno nuevo.",
    DOWNLOAD_TICKET_USED: "Este enlace de descarga ya fue utilizado. Solicita uno nuevo.",
  };
  return messages[reason] ?? "No se pudo completar la operación.";
}
