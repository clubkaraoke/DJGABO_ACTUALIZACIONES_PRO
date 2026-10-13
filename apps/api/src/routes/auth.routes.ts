import { createHash, timingSafeEqual, createHmac } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { eq, and, count } from "drizzle-orm";
import { z } from "zod";
import { hashPassword, verifyPassword } from "../auth/passwordHash.js";
import { signAccessToken, generateOpaqueRefreshToken, hashRefreshToken } from "../auth/tokens.js";
import type { Env } from "../env.js";
import type { MeDTO, LoginResponseDTO } from "@djgabo/shared";
import { users, plans, refreshTokens, deviceSessions } from "../db/schema.js";
import { createId } from "../db/id.js";
import { sqliteClient } from "../db/client.js";
import { normalizeVipPhone } from "../services/vipPhones.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const vipInviteSchema = z.object({
  inviteCode: z.string().min(8),
  email: z.string().email(),
  whatsapp: z.string().min(8).max(40),
  password: z.string().min(8).max(128),
  verificationCode: z.string().regex(/^\d{6}$/),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export async function registerAuthRoutes(fastify: FastifyInstance, env: Env) {
  const { db } = fastify;

  const isValidInviteCode = (value: string): boolean => {
    if (!env.VIP_MIGRATION_INVITE_CODE) return false;
    const received = createHash("sha256").update(value).digest();
    const expected = createHash("sha256").update(env.VIP_MIGRATION_INVITE_CODE).digest();
    return timingSafeEqual(received, expected);
  };

  async function buildMeDTO(userId: string): Promise<MeDTO | null> {
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) return null;
    const plan = user.planId ? await db.query.plans.findFirst({ where: eq(plans.id, user.planId) }) : null;
    const [devicesRow] = await db
      .select({ value: count() })
      .from(deviceSessions)
      .where(and(eq(deviceSessions.userId, user.id), eq(deviceSessions.active, true)));

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      role: user.role as MeDTO["role"],
      status: user.status as MeDTO["status"],
      plan: plan ? { id: plan.id, name: plan.name, slug: plan.slug, maxDevices: plan.maxDevices } : null,
      subscriptionStart: user.subscriptionStart?.toISOString() ?? null,
      subscriptionEnd: user.subscriptionEnd?.toISOString() ?? null,
      maxDevices: user.maxDevices,
      devicesUsed: devicesRow?.value ?? 0,
    };
  }

  async function issueSession(userId: string, role: "ADMIN" | "MEMBER"): Promise<LoginResponseDTO> {
    const accessToken = signAccessToken(env, { sub: userId, role });
    const { token: refreshToken, hash } = generateOpaqueRefreshToken();
    await db.insert(refreshTokens).values({
      id: createId("rt"),
      userId,
      tokenHash: hash,
      expiresAt: new Date(Date.now() + env.JWT_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000),
      createdAt: new Date(),
    });
    const me = await buildMeDTO(userId);
    return { accessToken, refreshToken, user: me! };
  }

  fastify.get<{ Params: { code: string } }>(
    "/api/auth/vip-invite/:code/validate",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
      if (!isValidInviteCode(request.params.code)) {
        return reply.code(404).send({ error: "INVITE_NOT_FOUND", message: "Enlace de invitación no válido", statusCode: 404 });
      }
      return reply.send({ valid: true });
    },
  );

  fastify.post(
    "/api/auth/vip-invite/register",
    { config: { rateLimit: { max: 6, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const parsed = vipInviteSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "INVALID_INPUT", message: "Revisa tu correo, WhatsApp y contraseña", statusCode: 400 });
      }
      const { inviteCode, password } = parsed.data;
      if (!isValidInviteCode(inviteCode)) {
        return reply.code(404).send({ error: "INVITE_NOT_FOUND", message: "Enlace de invitación no válido", statusCode: 404 });
      }

      const email = parsed.data.email.trim().toLowerCase();
      const whatsapp = normalizeVipPhone(parsed.data.whatsapp);
      if (!whatsapp) return reply.code(400).send({error:"INVALID_WHATSAPP",message:"Ingresa un WhatsApp válido con código de país"});
      const sqlite = sqliteClient(db);
      const record = sqlite.prepare("SELECT * FROM vip_allowed_phones WHERE phone=?").get(whatsapp) as
        {phone:string; verification_hash:string|null; verification_expires:number|null; used_user_id:string|null; revoked:number}|undefined;
      if (!record || record.revoked) return reply.code(403).send({error:"WHATSAPP_NOT_AUTHORIZED",message:"Tu WhatsApp no está autorizado para este registro VIP."});
      if (record.used_user_id) return reply.code(409).send({error:"WHATSAPP_ALREADY_REGISTERED",message:"Este WhatsApp ya registró su membresía. Inicia sesión."});
      const digest = createHmac("sha256", env.JWT_ACCESS_SECRET).update(whatsapp + ":" + parsed.data.verificationCode).digest("hex");
      const valid = record.verification_hash && record.verification_expires && record.verification_expires >= Date.now() &&
        timingSafeEqual(Buffer.from(digest), Buffer.from(record.verification_hash));
      if (!valid) return reply.code(403).send({error:"VERIFICATION_REQUIRED",message:"Código de verificación incorrecto o vencido. Solicita uno nuevo por WhatsApp."});
      const plan = await db.query.plans.findFirst({where:eq(plans.slug,"pro-anual")});
      if (!plan) return reply.code(503).send({error:"VIP_PLAN_UNAVAILABLE",message:"El plan VIP no está disponible temporalmente."});
      const now = new Date();
      const userId = createId("usr");
      const passwordHash = await hashPassword(password);
      const name = email.split("@")[0]?.slice(0,60) || "Cliente VIP";
      // One SQLite transaction prevents concurrent reuse and partial account creation.
      try {
        const transaction = sqlite.transaction(() => {
          const claimed = sqlite.prepare("UPDATE vip_allowed_phones SET used_user_id=?,used_at=?,verification_hash=NULL,verification_expires=NULL WHERE phone=? AND used_user_id IS NULL AND revoked=0 AND verification_hash=? AND verification_expires>=?").run(userId,Date.now(),whatsapp,digest,Date.now());
          if (claimed.changes !== 1) throw new Error("INVITATION_ALREADY_USED");
          // Better-sqlite3 stores Drizzle timestamp dates as Unix seconds.
          sqlite.prepare("INSERT INTO users(id,email,password_hash,name,role,status,plan_id,subscription_start,subscription_end,legacy_pending_expiry,max_devices,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
            .run(userId,email,passwordHash,name,"MEMBER","ACTIVE",plan.id,Math.floor(now.getTime()/1000),null,1,plan.maxDevices,Math.floor(now.getTime()/1000),Math.floor(now.getTime()/1000));
        });
        transaction();
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (message.includes("UNIQUE constraint failed: users.email")) return reply.code(409).send({error:"EMAIL_ALREADY_REGISTERED",message:"Este correo ya tiene una cuenta. Ingresa desde Acceso VIP."});
        if (message.includes("INVITATION_ALREADY_USED")) return reply.code(409).send({error:"INVITATION_ALREADY_USED",message:"Este WhatsApp ya utilizó su invitación."});
        throw error;
      }
      try { await fastify.vipMigrationService.save({userId,email,whatsapp,registeredAt:now.toISOString()}); }
      catch (err) { fastify.log.error({err},"Could not sync legacy VIP contact record"); }
      const body = await issueSession(userId, "MEMBER");
      return reply.code(201).send(body);
    },
  );

  fastify.post(
    "/api/auth/login",
    { config: { rateLimit: { max: 8, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const parsed = loginSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "INVALID_INPUT", message: "Email o contraseña inválidos", statusCode: 400 });
      }
      const email = parsed.data.email.trim().toLowerCase();
      const { password } = parsed.data;

      const user = await db.query.users.findFirst({ where: eq(users.email, email) });
      if (!user || !(await verifyPassword(password, user.passwordHash))) {
        return reply.code(401).send({ error: "INVALID_CREDENTIALS", message: "Email o contraseña incorrectos", statusCode: 401 });
      }

      if (user.status === "SUSPENDED") {
        return reply.code(403).send({ error: "USER_SUSPENDED", message: "Tu cuenta está suspendida. Contacta al administrador.", statusCode: 403 });
      }
      const isExpiredByStatus = user.status === "EXPIRED";
      const isExpiredByDate = user.subscriptionEnd ? user.subscriptionEnd.getTime() < Date.now() : false;
      if (isExpiredByStatus || isExpiredByDate) {
        return reply.code(403).send({ error: "USER_EXPIRED", message: "Tu membresía ha vencido. Renuévala para continuar.", statusCode: 403 });
      }

      return reply.send(await issueSession(user.id, user.role as "ADMIN" | "MEMBER"));
    },
  );

  fastify.post("/api/auth/refresh", async (request, reply) => {
    const parsed = refreshSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "INVALID_INPUT", message: "refreshToken requerido", statusCode: 400 });
    }
    const hash = hashRefreshToken(parsed.data.refreshToken);
    const stored = await db.query.refreshTokens.findFirst({ where: eq(refreshTokens.tokenHash, hash) });
    if (!stored || stored.revokedAt || stored.expiresAt.getTime() < Date.now()) {
      return reply.code(401).send({ error: "INVALID_REFRESH_TOKEN", message: "Sesión expirada, inicia sesión de nuevo", statusCode: 401 });
    }

    const user = await db.query.users.findFirst({ where: eq(users.id, stored.userId) });
    if (!user || user.status !== "ACTIVE") {
      return reply.code(403).send({ error: "USER_NOT_ACTIVE", message: "Cuenta no activa", statusCode: 403 });
    }

    await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.id, stored.id));
    const { token: newRefreshToken, hash: newHash } = generateOpaqueRefreshToken();
    await db.insert(refreshTokens).values({
      id: createId("rt"),
      userId: user.id,
      tokenHash: newHash,
      expiresAt: new Date(Date.now() + env.JWT_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000),
      createdAt: new Date(),
    });
    const accessToken = signAccessToken(env, { sub: user.id, role: user.role as "ADMIN" | "MEMBER" });
    return reply.send({ accessToken, refreshToken: newRefreshToken });
  });

  fastify.post("/api/auth/logout", async (request, reply) => {
    const parsed = refreshSchema.safeParse(request.body);
    if (parsed.success) {
      const hash = hashRefreshToken(parsed.data.refreshToken);
      await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.tokenHash, hash));
    }
    return reply.code(204).send();
  });

  fastify.get("/api/auth/me", { preHandler: fastify.authenticate }, async (request, reply) => {
    const me = await buildMeDTO(request.authUser!.sub);
    if (!me) return reply.code(404).send({ error: "USER_NOT_FOUND", message: "Usuario no encontrado", statusCode: 404 });
    return reply.send(me);
  });
}
