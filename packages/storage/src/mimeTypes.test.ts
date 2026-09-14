import { describe, it, expect } from "vitest";
import { resolveMimeType, resolveMimeTypeFromFileName } from "./mimeTypes.js";

describe("resolveMimeType", () => {
  it("mp4 -> video/mp4", () => {
    expect(resolveMimeType("mp4")).toBe("video/mp4");
  });
  it("mp3 -> audio/mpeg (el tipo MIME IANA correcto, no audio/mp3)", () => {
    expect(resolveMimeType("mp3")).toBe("audio/mpeg");
  });
  it("wav -> audio/wav", () => {
    expect(resolveMimeType("wav")).toBe("audio/wav");
  });
  it("mov -> video/quicktime", () => {
    expect(resolveMimeType("mov")).toBe("video/quicktime");
  });
  it("mkv -> video/x-matroska", () => {
    expect(resolveMimeType("mkv")).toBe("video/x-matroska");
  });
  it("es insensible a mayúsculas y a un punto inicial", () => {
    expect(resolveMimeType("MP4")).toBe("video/mp4");
    expect(resolveMimeType(".mp3")).toBe("audio/mpeg");
  });
  it("una extensión desconocida cae a application/octet-stream, no revienta", () => {
    expect(resolveMimeType("xyz")).toBe("application/octet-stream");
  });
});

describe("resolveMimeTypeFromFileName", () => {
  it("extrae la extensión del nombre completo del archivo", () => {
    expect(resolveMimeTypeFromFileName("GRUPO 5 - MOTOR Y MOTIVO.mp4")).toBe("video/mp4");
    expect(resolveMimeTypeFromFileName("cancion.wav")).toBe("audio/wav");
  });
  it("un nombre sin extensión cae a application/octet-stream", () => {
    expect(resolveMimeTypeFromFileName("sin-extension")).toBe("application/octet-stream");
  });
});
