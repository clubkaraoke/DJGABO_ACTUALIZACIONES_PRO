import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import type { Role } from "@djgabo/shared";
import type { Env } from "../env.js";

export interface AccessTokenPayload {
  sub: string; // userId
  role: Role;
  deviceId?: string;
}

export function signAccessToken(env: Env, payload: AccessTokenPayload): string {
  const options: jwt.SignOptions = { expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions["expiresIn"] };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, options);
}

export function verifyAccessToken(env: Env, token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
}

/** El refresh token es opaco (random), se guarda hasheado en DB para poder revocarlo (logout). */
export function generateOpaqueRefreshToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(48).toString("base64url");
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  return { token, hash };
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
