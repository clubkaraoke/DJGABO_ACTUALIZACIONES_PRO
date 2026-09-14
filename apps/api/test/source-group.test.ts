import { describe, expect, it } from "vitest";
import { deriveSourceGroup, prettifySourceGroup } from "../src/services/sourceGroup.js";

describe("sourceGroup", () => {
  it("deriva la marca situada debajo de la carpeta mensual", () => {
    expect(
      deriveSourceGroup(
        "/djgabo berrocal/ACTUALIZACIONES_TEST/2026/05 MAYO/02_KK-Live/Carin Leon - Tema.mp4",
        "/djgabo berrocal/ACTUALIZACIONES_TEST/2026/05 MAYO",
      ),
    ).toBe("02_KK-Live");
  });

  it("devuelve null para un archivo directo en el mes", () => {
    expect(
      deriveSourceGroup(
        "/ACTUALIZACIONES/2026/05 MAYO/Artista - Tema.wav",
        "/ACTUALIZACIONES/2026/05 MAYO",
      ),
    ).toBeNull();
  });

  it("produce etiquetas legibles sin cambiar la ruta original", () => {
    expect(prettifySourceGroup("01_Club_KARAOKE")).toBe("Club KARAOKE");
    expect(prettifySourceGroup("02_KK-Live")).toBe("KK-Live");
    expect(prettifySourceGroup("04_Dj_SA")).toBe("DJ SA");
    expect(prettifySourceGroup("05_Rfk")).toBe("RFK");
  });
});
