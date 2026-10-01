import type { FastifyInstance } from "fastify";
import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { signAccessToken } from "../auth/tokens.js";
import {
  authBridgeAssertions,
  externalAuthIdentities,
  plans,
  users,
} from "../db/schema.js";
import { createId } from "../db/id.js";

const bodySchema = z.object({
  appId: z.string().min(1),
  subject: z.string().min(1).max(255),
  email: z.string().email().max(320),
  name: z.string().min(1).max(200),
  avatarUrl: z.union([z.string().url(), z.literal(""), z.null()]).optional(),
  iat: z.number().int(),
  exp: z.number().int(),
  jti: z.string().min(16).max(200),
  signature: z.string().min(32).max(256),
});

function canonical(input: z.infer<typeof bodySchema>) {
  return [
    input.appId,
    input.subject,
    input.email.trim().toLowerCase(),
    input.name,
    input.avatarUrl ?? "",
    String(input.iat),
    String(input.exp),
    input.jti,
  ].join("\n");
}

function verifySignature(key: string, data: string, provided: string) {
  const expected = crypto.createHmac("sha256", key).update(data).digest("base64url");
  try {
    const a = Buffer.from(expected, "base64url");
    const b = Buffer.from(provided, "base64url");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function registerBase44BridgeRoutes(fastify: FastifyInstance) {
  const { db, env } = fastify;

  fastify.post(
    "/api/auth/base44/exchange",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (request, reply) => {
      if (!env.BASE44_BRIDGE_KEY || !env.BASE44_APP_ID) {
        return reply.code(503).send({
          error: "BASE44_BRIDGE_NOT_CONFIGURED",
          message: "El puente Base44 todavía no está configurado.",
          statusCode: 503,
        });
      }

      const parsed = bodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: "INVALID_ASSERTION",
          message: "Aserción Base44 inválida.",
          statusCode: 400,
        });
      }

      const input = parsed.data;
      const nowSec = Math.floor(Date.now() / 1000);

      if (input.appId !== env.BASE44_APP_ID) {
        request.log.warn(
          { receivedAppId: input.appId },
          "[BASE44_BRIDGE] appId mismatch",
        );
        return reply.code(401).send({
          error: "BASE44_APP_MISMATCH",
          message: "La app Base44 no coincide con la configurada en Railway.",
          statusCode: 401,
        });
      }

      const timeInvalid =
        input.iat > nowSec + 15 ||
        input.exp < nowSec ||
        input.exp - input.iat > 90;

      if (timeInvalid) {
        request.log.warn(
          {
            nowSec,
            iat: input.iat,
            exp: input.exp,
            ttl: input.exp - input.iat,
          },
          "[BASE44_BRIDGE] assertion time invalid",
        );
        return reply.code(401).send({
          error: "BASE44_ASSERTION_TIME_INVALID",
          message: "La aserción Base44 tiene un timestamp inválido o ya venció.",
          statusCode: 401,
        });
      }

      if (!verifySignature(env.BASE44_BRIDGE_KEY, canonical(input), input.signature)) {
        request.log.warn(
          {
            appId: input.appId,
            subject: input.subject,
            email: input.email.trim().toLowerCase(),
            name: input.name,
            avatarPresent: Boolean(input.avatarUrl),
            iat: input.iat,
            exp: input.exp,
            jtiLength: input.jti.length,
          },
          "[BASE44_BRIDGE] signature mismatch",
        );
        return reply.code(401).send({
          error: "BASE44_SIGNATURE_INVALID",
          message: "La firma Base44 no coincide con la esperada por Railway.",
          statusCode: 401,
        });
      }

      let identity = await db.query.externalAuthIdentities.findFirst({
        where: and(
          eq(externalAuthIdentities.provider, "base44"),
          eq(externalAuthIdentities.providerSubject, input.subject),
        ),
      });

      const normalizedEmail = input.email.trim().toLowerCase();
      let user = identity
        ? await db.query.users.findFirst({ where: eq(users.id, identity.userId) })
        : await db.query.users.findFirst({ where: eq(users.email, normalizedEmail) });

      if (
        !user &&
        env.BASE44_OWNER_EMAIL?.trim().toLowerCase() === normalizedEmail &&
        env.BASE44_OWNER_SUBJECT === input.subject &&
        env.BASE44_OWNER_RAILWAY_EMAIL
      ) {
        user = await db.query.users.findFirst({
          where: eq(users.email, env.BASE44_OWNER_RAILWAY_EMAIL.trim().toLowerCase()),
        });
      }

      if (!user) {
        return reply.code(403).send({
          error: "RAILWAY_ACCOUNT_NOT_PROVISIONED",
          message: "Tu cuenta todavía no tiene una membresía habilitada en el servidor.",
          statusCode: 403,
        });
      }

      if (user.status === "SUSPENDED") {
        return reply.code(403).send({
          error: "USER_SUSPENDED",
          message: "Tu cuenta está suspendida.",
          statusCode: 403,
        });
      }
      if (
        user.status === "EXPIRED" ||
        (user.subscriptionEnd && user.subscriptionEnd.getTime() < Date.now())
      ) {
        return reply.code(403).send({
          error: "USER_EXPIRED",
          message: "Tu membresía ha vencido.",
          statusCode: 403,
        });
      }

      try {
        await db.insert(authBridgeAssertions).values({
          jti: input.jti,
          provider: "base44",
          userId: user.id,
          expiresAt: new Date(input.exp * 1000),
          consumedAt: new Date(),
        });
      } catch {
        return reply.code(409).send({
          error: "BASE44_ASSERTION_REPLAYED",
          message: "Esta autenticación Base44 ya fue utilizada.",
          statusCode: 409,
        });
      }

      if (!identity) {
        await db.insert(externalAuthIdentities).values({
          id: createId("ext"),
          provider: "base44",
          providerSubject: input.subject,
          userId: user.id,
          emailAtLink: normalizedEmail,
          createdAt: new Date(),
          lastSeenAt: new Date(),
        });
        identity = await db.query.externalAuthIdentities.findFirst({
          where: and(
            eq(externalAuthIdentities.provider, "base44"),
            eq(externalAuthIdentities.providerSubject, input.subject),
          ),
        });
      } else {
        await db
          .update(externalAuthIdentities)
          .set({ emailAtLink: normalizedEmail, lastSeenAt: new Date() })
          .where(eq(externalAuthIdentities.id, identity.id));
      }

      const accessToken = signAccessToken(env, {
        sub: user.id,
        role: user.role as "ADMIN" | "MEMBER",
      });

      const plan = user.planId
        ? await db.query.plans.findFirst({ where: eq(plans.id, user.planId) })
        : null;

      return reply.send({
        accessToken,
        expiresInSeconds: 900,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatarUrl: user.avatarUrl,
          role: user.role,
          status: user.status,
          plan: plan
            ? {
                id: plan.id,
                name: plan.name,
                slug: plan.slug,
                maxDevices: plan.maxDevices,
              }
            : null,
          subscriptionStart: user.subscriptionStart?.toISOString() ?? null,
          subscriptionEnd: user.subscriptionEnd?.toISOString() ?? null,
          maxDevices: user.maxDevices,
        },
      });
    },
  );
}
