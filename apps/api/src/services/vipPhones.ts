/** Canonical WhatsApp digits including country code. Old Mexican 521 format maps to 52. */
export function normalizeVipPhone(input: string): string | null {
  let n = input.replace(/\D/g, "");
  if (n.startsWith("521") && n.length === 13) n = "52" + n.slice(3);
  return /^[1-9]\d{7,14}$/.test(n) ? n : null;
}
