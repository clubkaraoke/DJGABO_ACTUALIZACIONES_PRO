import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const partsDir = path.join(appRoot, "cover-assets");
const outDir = path.join(appRoot, "public", "covers", "sprites");

const partNames = (await readdir(partsDir))
  .filter((name) => /^part\d+\.b64$/.test(name))
  .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));

if (partNames.length !== 6) {
  throw new Error(`Expected 6 cover data parts, found ${partNames.length}`);
}

let encoded = "";
for (const name of partNames) {
  encoded += (await readFile(path.join(partsDir, name), "utf8")).replace(/\s+/g, "");
}

const data = Buffer.from(encoded, "base64");
const expected = [
  "2024_1.webp",
  "2024_2.webp",
  "2025_1.webp",
  "2025_2.webp",
  "2026_1.webp",
  "2026_2.webp",
];

const images = [];
let offset = 0;
while (offset < data.length) {
  if (offset + 12 > data.length) throw new Error("Truncated WEBP sprite data");
  if (data.toString("ascii", offset, offset + 4) !== "RIFF") {
    throw new Error(`Invalid RIFF header at offset ${offset}`);
  }
  if (data.toString("ascii", offset + 8, offset + 12) !== "WEBP") {
    throw new Error(`Invalid WEBP header at offset ${offset}`);
  }

  const fileSize = data.readUInt32LE(offset + 4) + 8;
  if (fileSize <= 12 || offset + fileSize > data.length) {
    throw new Error(`Invalid WEBP size ${fileSize} at offset ${offset}`);
  }

  images.push(data.subarray(offset, offset + fileSize));
  offset += fileSize;
}

if (offset !== data.length || images.length !== expected.length) {
  throw new Error(`Expected ${expected.length} WEBP sprites, got ${images.length}`);
}

await mkdir(outDir, { recursive: true });
await Promise.all(
  expected.map((name, index) => writeFile(path.join(outDir, name), images[index])),
);

console.log(`[covers] generated ${images.length} WEBP sprites in ${outDir}`);
