import jwt from "jsonwebtoken";
import type { Env } from "../env.js";

export interface DemoTicketPayload {
  sub: string;
  resourceId: string;
  kind: "CDG_DEMO";
}

function secret(env: Env): string {
  return env.DOWNLOAD_TICKET_SECRET ?? env.JWT_ACCESS_SECRET;
}

export function signDemoTicket(
  env: Env,
  payload: Omit<DemoTicketPayload, "kind">,
): string {
  return jwt.sign(
    { ...payload, kind: "CDG_DEMO" },
    secret(env),
    {
      expiresIn: "3m",
      audience: "djgabo-cdg-demo",
      issuer: "djgabo-api",
    },
  );
}

export function verifyDemoTicket(env: Env, token: string): DemoTicketPayload {
  const payload = jwt.verify(token, secret(env), {
    audience: "djgabo-cdg-demo",
    issuer: "djgabo-api",
  }) as DemoTicketPayload;

  if (payload.kind !== "CDG_DEMO" || !payload.sub || !payload.resourceId) {
    throw new Error("DEMO_TICKET_INVALID");
  }
  return payload;
}
