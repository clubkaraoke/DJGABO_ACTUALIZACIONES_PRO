/**
 * Único lugar del proyecto que decide qué MIME type le corresponde a una
 * extensión de archivo. Antes esto estaba duplicado e inline en
 * StorageIndexerService (para master y para preview por separado) y usaba
 * `audio/mp3`, que no es el tipo MIME IANA correcto para MP3 (es
 * `audio/mpeg`). Todo el proyecto debe pasar por aquí — nunca construir un
 * mimeType a mano con un ternario.
 */
const EXTENSION_TO_MIME_TYPE: Record<string, string> = {
  mp4: "video/mp4",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
};

const DEFAULT_MIME_TYPE = "application/octet-stream";

/** Normaliza la extensión (sin el punto, minúsculas) y resuelve su MIME type. Desconocida -> application/octet-stream. */
export function resolveMimeType(extension: string): string {
  const normalized = extension.replace(/^\./, "").toLowerCase();
  return EXTENSION_TO_MIME_TYPE[normalized] ?? DEFAULT_MIME_TYPE;
}

/** Variante conveniente cuando se tiene el nombre de archivo completo en vez de solo la extensión. */
export function resolveMimeTypeFromFileName(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  if (dot === -1) return DEFAULT_MIME_TYPE;
  return resolveMimeType(fileName.slice(dot + 1));
}
