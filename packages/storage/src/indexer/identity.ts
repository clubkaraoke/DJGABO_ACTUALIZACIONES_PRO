import { createHash } from "node:crypto";

/**
 * IDENTIDAD INTERNA vs. CÓDIGO VISUAL (punto 1 de la pasada anterior)
 * ===============================================
 * `Karaoke.code` (ver filenameParser.ts -> deriveCodeFromKey) es un valor
 * CORTO pensado para mostrarse en la UI ("DJG-XXXXXX") — nunca debe usarse
 * para decidir si dos archivos son "el mismo". Antes sí se usaba así, con
 * un hash de 32 bits: con catálogos de decenas de miles de archivos eso es
 * una superficie de colisión real, no teórica.
 *
 * `deriveIdentityKey` es la función que SÍ se usa para reconocer un archivo
 * ya existente:
 *  - Si el provider da un `providerFileId` (Dropbox lo da y es estable
 *    entre renames/moves), se usa TAL CUAL, sin hashear — ya es único por
 *    diseño del provider; hashear una cadena ya única solo puede sumar
 *    riesgo de colisión, nunca reducirlo.
 *  - Si no (provider sin ID estable, ej. Mock por defecto), se deriva con
 *    SHA-256 del storageKey, truncado a 128 bits (32 caracteres hex) — muy
 *    por encima de los 96/128 bits mínimos pedidos, y astronómicamente más
 *    seguro que un hash de 32 bits para el mismo propósito.
 *
 * AISLAMIENTO ENTRE PROVIDERS (corrección de esta pasada): el `provider`
 * ahora forma parte de la identidad misma (`pid:<provider>:<providerFileId>`
 * / `sk:<provider>:<hash>`). Sin esto, un `providerFileId` o un `storageKey`
 * coincidentes entre Mock y Dropbox (o entre dos providers futuros)
 * producirían la MISMA identidad interna y el indexador confundiría dos
 * archivos completamente distintos con "el mismo". Los prefijos ("pid:"/
 * "sk:") además garantizan que un providerFileId real nunca pueda coincidir
 * por accidente con un hash de fallback, aunque las cadenas crudas fueran
 * iguales.
 */
export function deriveIdentityKey(
  provider: string,
  providerFileId: string | undefined | null,
  storageKey: string,
): string {
  if (providerFileId) return `pid:${provider}:${providerFileId}`;
  const hash = createHash("sha256").update(storageKey).digest("hex");
  return `sk:${provider}:${hash.slice(0, 32)}`; // 128 bits
}
