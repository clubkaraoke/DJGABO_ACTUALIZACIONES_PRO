import { describe, expect, it, vi } from "vitest";
import { cleanForDeezerSearch, findDeezerCover } from "../src/services/deezerCoverService.js";

describe("Deezer cover service", () => {
  it("limpia etiquetas técnicas del karaoke antes de buscar", () => {
    expect(cleanForDeezerSearch("Hasta la raiz KARAOKE (Coro)")).toBe("Hasta la raiz");
    expect(cleanForDeezerSearch("Cabron Y Medio (Coros) [DJ Sauly Karaoke]")).toBe("Cabron Y Medio");
    expect(cleanForDeezerSearch("Me duele Tu Ausencia - Banda - LF Karaokes")).toBe("Me duele Tu Ausencia - Banda");
  });

  it("elige una portada solo cuando título y artista tienen coincidencia suficiente", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: [
          {
            title_short: "Hasta la Raíz",
            artist: { name: "Natalia Lafourcade" },
            album: { cover_medium: "https://img.test/natalia-250.jpg" },
          },
          {
            title_short: "Otra Canción",
            artist: { name: "Otro Artista" },
            album: { cover_medium: "https://img.test/wrong.jpg" },
          },
        ],
      }),
    })) as unknown as typeof fetch;

    await expect(findDeezerCover("Natalia Lafourcade", "Hasta la raiz KARAOKE (Coro)", fetchMock)).resolves.toBe(
      "https://img.test/natalia-250.jpg",
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const requestedUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(requestedUrl).toContain("api.deezer.com/search");
    expect(decodeURIComponent(requestedUrl)).not.toContain("KARAOKE");
  });

  it("prefiere no asignar cover cuando la coincidencia es débil", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: [
          {
            title_short: "Completamente Distinto",
            artist: { name: "Otro Artista" },
            album: { cover_medium: "https://img.test/wrong.jpg" },
          },
        ],
      }),
    })) as unknown as typeof fetch;

    await expect(findDeezerCover("Bronco", "Muerdeme (Con 2da Voz)", fetchMock)).resolves.toBeNull();
  });
});
