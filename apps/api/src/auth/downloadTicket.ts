import jwt from "jsonwebtoken";
import type { Env } from "../env.js";

export type DownloadTicketKind = "KARAOKE" | "COLLECTION_ZIP";

export interface DownloadTicketPayload {
  sub: string;
  deviceId: string;
  kind: DownloadTicketKind;
  resourceId: string;
  jti?: string;
}

function secret(env: Env): string {
  return env.DOWNLOAD_TICKET_SECRET ?? env.JWT_ACCESS_SECRET;
}

export function signDownloadTicket(env: Env, payload: DownloadTicketPayload): string {
  return jwt.sign(payload, secret(env), {
    expiresIn: "90s",
    audience: "djgabo-download",
    issuer: "djgabo-api",
  });
}

export function verifyDownloadTicket(env: Env, token: string): DownloadTicketPayload {
  return jwt.verify(token, secret(env), {
    audience: "djgabo-download",
    issuer: "djgabo-api",
  }) as DownloadTicketPayload;
}
