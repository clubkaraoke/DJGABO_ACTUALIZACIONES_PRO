import { describe, expect, it } from "vitest";
import { normalizedYouTubeVideoUrl, visitorKaraokeWhatsAppUrl } from "./orderWhatsApp";

describe("visitor karaoke WhatsApp request", () => {
  it("accepts common YouTube URL forms and normalizes the video ID", () => {
    expect(normalizedYouTubeVideoUrl("https://youtu.be/dQw4w9WgXcQ?t=5")).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(normalizedYouTubeVideoUrl("https://music.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(normalizedYouTubeVideoUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  });
  it("rejects external domains, malformed links and fake youtube URLs", () => {
    expect(normalizedYouTubeVideoUrl("https://youtube.com.evil.net/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(normalizedYouTubeVideoUrl("javascript:alert(1)")).toBeNull();
    expect(normalizedYouTubeVideoUrl("https://www.youtube.com/watch?v=invalid")).toBeNull();
  });
  it("includes MP4, fixed visitor price, five minute limit and the YouTube source, without charging", () => {
    const url = visitorKaraokeWhatsAppUrl("https://youtu.be/dQw4w9WgXcQ");
    const parsed = new URL(url);
    expect(parsed.origin).toBe("https://wa.me");
    expect(parsed.pathname).toBe("/51921675846");
    const text = parsed.searchParams.get("text") ?? "";
    expect(text).toContain("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(text).toContain("US$14.99");
    expect(text).toContain("5 minutos");
    expect(text).toContain("MP4");
    expect(text).toContain("cómo realizar el pago");
  });
});
