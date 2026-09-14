import { randomUUID } from "node:crypto";

/** IDs opacos tipo "usr_xxxxxxxx". Prefijo legible + UUID para debug fácil. */
export function createId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}
