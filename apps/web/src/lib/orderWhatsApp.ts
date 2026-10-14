/** Enlaces de solicitud de pago manual: nunca crean ni consumen pedidos VIP. */
export const VISITOR_KARAOKE_PRICE_USD = "14.99";
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export function normalizedYouTubeVideoUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const host = url.hostname.toLowerCase();
    let videoId: string | null = null;
    if (host === "youtu.be" || host === "www.youtu.be") {
      videoId = url.pathname.split("/")[1] || null;
    } else if (["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"].includes(host)) {
      if (url.pathname === "/watch") videoId = url.searchParams.get("v");
      else if (/^\/(shorts|live|embed)\//.test(url.pathname)) videoId = url.pathname.split("/")[2] || null;
    }
    if (!videoId || !VIDEO_ID.test(videoId)) return null;
    return "https://www.youtube.com/watch?v=" + videoId;
  } catch {
    return null;
  }
}

export function visitorKaraokeWhatsAppUrl(youtubeUrl: string): string {
  const normalized = normalizedYouTubeVideoUrl(youtubeUrl);
  if (!normalized) throw new Error("Enlace de YouTube no válido");
  const message = [
    "Hola DJGABO, deseo solicitar un karaoke A PEDIDO como visitante.",
    "",
    "Video de YouTube: " + normalized,
    "Entrega: video karaoke MP4.",
    "Precio: US$" + VISITOR_KARAOKE_PRICE_USD + " por canción de hasta 5 minutos.",
    "",
    "Por favor, confírmame la duración, disponibilidad y cómo realizar el pago.",
  ].join("\n");
  return "https://wa.me/51921675846?text=" + encodeURIComponent(message);
}
