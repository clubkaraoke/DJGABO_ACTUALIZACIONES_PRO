import { describe, expect, it } from "vitest";
import { publicKaraokeDisplay, publicKaraokeTypes, publicSearchMatches } from "./publicCatalogPresentation";

const display = (title: string) => publicKaraokeDisplay({ artist: "Majo Aguilar", title });
const types = (title: string) => publicKaraokeTypes({ title });

describe("DJGABO compact karaoke type labels", () => {
  it("removes Karaoke/Coro from display titles without changing the source title", () => {
    const karaoke = { artist: "Majo Aguilar", title: "Almohada Karaoke (Coro)" };
    expect(publicKaraokeDisplay(karaoke).title).toBe("Almohada");
    expect(publicKaraokeTypes(karaoke)).toEqual(["Karaoke", "Coro"]);
    expect(karaoke.title).toBe("Almohada Karaoke (Coro)");
  });
  it("shows the karaoke pill even for an ordinary title", () => {
    expect(display("Dime Quien Te Hizo Pensar").title).toBe("Dime Quien Te Hizo Pensar");
    expect(types("Dime Quien Te Hizo Pensar")).toEqual(["Karaoke"]);
  });
  it("uses the purple En vivo pill and removes only presentation tokens", () => {
    expect(display("Mix Faraona 1 Karaoke (Coro) - En vivo").title).toBe("Mix Faraona 1");
    expect(types("Mix Faraona 1 Karaoke (Coro) - En vivo")).toEqual(["Karaoke", "Coro", "En vivo"]);
  });
  it("uses Live Session rather than duplicate live pills", () => {
    expect(display("Mix Faraona 1 Karaoke (Live Session)").title).toBe("Mix Faraona 1");
    expect(types("Mix Faraona 1 Karaoke (Live Session)")).toEqual(["Karaoke", "Live Session"]);
    expect(types("Tema Karaoke En vivo Live Session")).toEqual(["Karaoke", "Live Session"]);
  });
  it("removes technical Karaoke even when it is not the last word", () => {
    expect(display("Almohada Karaoke (Coro) 2026").title).toBe("Almohada 2026");
  });
  it("keeps searches for hidden keywords working without changing underlying data", () => {
    const karaoke = { artist: "Majo Aguilar", title: "Almohada Karaoke (Coro)", code: "DJG-2026" };
    expect(publicSearchMatches(karaoke, "Karaoke")).toBe(true);
    expect(publicSearchMatches(karaoke, "Coro")).toBe(true);
    expect(publicSearchMatches(karaoke, "Almohada")).toBe(true);
  });
});
