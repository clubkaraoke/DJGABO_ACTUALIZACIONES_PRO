import fp from "fastify-plugin";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Role } from "@djgabo/shared";
import { verifyAccessToken, type AccessTokenPayload } from "./tokens.js";
import type { Env } from "../env.js";

declare module "fastify" {
  interface FastifyRequest {
    authUser?: AccessTokenPayload;
  }
}

export const authPlugin = fp(async function authPlugin(fastify: FastifyInstance, opts: { env: Env }) {
  fastify.decorateRequest("authUser", undefined);

  fastify.decorate("authenticate", async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      return reply.code(401).send({ error: "UNAUTHORIZED", message: "Token faltante", statusCode: 401 });
    }
    try {
      request.authUser = verifyAccessToken(opts.env, header.slice("Bearer ".length));
    } catch {
      return reply.code(401).send({ error: "UNAUTHORIZED", message: "Token inválido o expirado", statusCode: 401 });
    }
  });

  fastify.decorate("requireRole", (role: Role) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.authUser) {
        return reply.code(401).send({ error: "UNAUTHORIZED", message: "No autenticado", statusCode: 401 });
      }
      if (request.authUser.role !== role) {
        // Un MEMBER JAMÁS puede pasar de aquí, sin importar lo que pida el frontend.
        return reply.code(403).send({ error: "FORBIDDEN", message: "No tienes permisos para esta acción", statusCode: 403 });
      }
    };
  });
});

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (role: Role) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
