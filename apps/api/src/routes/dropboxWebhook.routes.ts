import { createHmac, timingSafeEqual } from "node:crypto";
import { Readable } from "node:stream";
import type { FastifyInstance } from "fastify";

function signaturesMatch(expected: string, received: string): boolean {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(received, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function registerDropboxWebhookRoutes(fastify: FastifyInstance) {
  await fastify.register(async (scope) => {
    // Conserva los bytes EXACTOS del POST solo dentro de este plugin para
    // verificar X-Dropbox-Signature sin alterar el parser JSON global.
    scope.addHook("preParsing", async (request, _reply, payload) => {
      if (request.method !== "POST") return payload;
      const chunks: Buffer[] = [];
      for await (const chunk of payload) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const rawBody = Buffer.concat(chunks);
      (request as typeof request & { rawBody?: Buffer }).rawBody = rawBody;
      return Readable.from(rawBody);
    });

    // Dropbox verifica la URL enviando ?challenge=... y exige devolver el
    // texto exacto, sin JSON ni HTML.
    scope.get("/api/webhooks/dropbox", async (request, reply) => {
      const query = request.query as { challenge?: string };
      if (!query.challenge) return reply.code(400).send("missing challenge");
      reply.type("text/plain; charset=utf-8");
      reply.header("X-Content-Type-Options", "nosniff");
      return reply.send(query.challenge);
    });

    scope.post("/api/webhooks/dropbox", async (request, reply) => {
      if (!fastify.dropboxIncrementalSyncService || !fastify.env.DROPBOX_APP_SECRET) {
        return reply.code(503).send({ error: "DROPBOX_INCREMENTAL_DISABLED" });
      }

      const rawBody = (request as typeof request & { rawBody?: Buffer }).rawBody ?? Buffer.alloc(0);
      const received = request.headers["x-dropbox-signature"];
      if (typeof received !== "string") {
        return reply.code(401).send({ error: "MISSING_DROPBOX_SIGNATURE" });
      }

      const expected = createHmac("sha256", fastify.env.DROPBOX_APP_SECRET).update(rawBody).digest("hex");
      if (!signaturesMatch(expected, received)) {
        return reply.code(401).send({ error: "INVALID_DROPBOX_SIGNATURE" });
      }

      // Dropbox espera una respuesta rápida. El trabajo real queda en cola
      // en memoria (1 réplica en staging) y usa cursor persistente en SQLite.
      fastify.dropboxIncrementalSyncService.trigger();
      return reply.code(200).send({ ok: true });
    });
  });
}
