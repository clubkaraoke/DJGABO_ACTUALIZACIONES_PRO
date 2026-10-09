import { describe, expect, it } from "vitest";
import { trustedCoverMatch } from "../src/services/CoverEnrichmentService.js";

describe("Conservative song AND artist cover matching", () => {
  it("rejects another singer even when the song title is identical", () => {
    expect(trustedCoverMatch("Majo Aguilar", "Almohada Karaoke (Coro)", "José José", "Almohada")).toBe(false);
    expect(trustedCoverMatch("Majo Aguilar", "Almohada Karaoke (Coro)", "Pepe Aguilar", "Almohada")).toBe(false);
    expect(trustedCoverMatch("Majo Aguilar", "Almohada Karaoke (Coro)", "Tito Nieves", "Almohada")).toBe(false);
  });
  it("accepts matching singer and track", () => {
    expect(trustedCoverMatch("Majo Aguilar", "Almohada Karaoke (Coro)", "Majo Aguilar", "Almohada")).toBe(true);
    expect(trustedCoverMatch("Tito Nieves", "Almohada Karaoke (Coro)", "Tito Nieves", "Almohada")).toBe(true);
  });
  it("rejects unrelated titles even with the correct singer", () => {
    expect(trustedCoverMatch("Majo Aguilar", "Almohada Karaoke (Coro)", "Majo Aguilar", "La Noche")).toBe(false);
  });
  it("accepts credits with an extra guest artist", () => {
    expect(trustedCoverMatch("Romeo Santos", "Dardos Karaoke (Coro)", "Romeo Santos & Prince Royce", "Dardos")).toBe(true);
  });
  it("rejects missing or unknown remote singer names", () => {
    expect(trustedCoverMatch("Majo Aguilar", "Almohada", "", "Almohada")).toBe(false);
    expect(trustedCoverMatch("", "Almohada", "Majo Aguilar", "Almohada")).toBe(false);
  });
});
