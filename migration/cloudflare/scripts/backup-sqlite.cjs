#!/usr/bin/env node
"use strict";
/**
 * Snapshot ONLINE de SQLite en Railway: solo lectura de origen mediante
 * better-sqlite3.backup(). NO usar cp sobre un SQLite activo con WAL.
 * El respaldo contiene datos personales. NUNCA subir a GitHub.
 *
 * Uso: node /repo/apps/api/migration/cloudflare/scripts/backup-sqlite.cjs
 * (ajustar ubicación cuando este archivo esté disponible en el contenedor).
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const Database = require("better-sqlite3");
const volumeRoot = "/data";
const destDir = path.join(volumeRoot, "migration-backups");

function actualPath(value) {
  if (!value) throw new Error("DATABASE_URL no configurada");
  const candidate = value.startsWith("file:") ? value.slice(5) : value;
  const resolved = path.resolve(process.cwd(), candidate);
  if (resolved !== volumeRoot && !resolved.startsWith(volumeRoot + path.sep)) {
    throw new Error("El SQLite no está en /data: detener la migración para revisar almacenamiento");
  }
  if (!fs.existsSync(resolved)) throw new Error("SQLite original no encontrado");
  return resolved;
}
function safeTables(db) {
  const names = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  ).all().map((x) => x.name);
  const rows = {};
  for (const name of names) {
    rows[name] = db.prepare('SELECT COUNT(*) AS n FROM "' + name.replace(/"/g, '""') + '"').get().n;
  }
  return rows;
}
async function sha256(file) {
  const hash = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
(async () => {
  const source = actualPath(process.env.DATABASE_URL);
  fs.mkdirSync(destDir, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const base = "djgabo-sqlite-" + stamp + "-" + crypto.randomBytes(3).toString("hex");
  const target = path.join(destDir, base + ".sqlite");
  const manifestFile = path.join(destDir, base + ".manifest.json");
  const live = new Database(source, { readonly: true, fileMustExist: true });
  try {
    await live.backup(target);
  } finally {
    live.close();
  }
  fs.chmodSync(target, 0o600);
  const snap = new Database(target, { readonly: true, fileMustExist: true });
  let report;
  try {
    const integrity = snap.pragma("integrity_check", { simple: true });
    const fkViolations = snap.pragma("foreign_key_check").length;
    report = {
      createdAt: new Date().toISOString(),
      snapshotFileName: path.basename(target),
      sizeBytes: fs.statSync(target).size,
      sha256: await sha256(target),
      integrityCheck: integrity,
      foreignKeyViolations: fkViolations,
      // Solo tablas y recuentos; jamás correos, hashes, pagos ni tokens
      rowCounts: safeTables(snap),
      status: integrity === "ok" && fkViolations === 0 ? "PASS" : "REVIEW",
    };
  } finally {
    snap.close();
  }
  fs.writeFileSync(manifestFile, JSON.stringify(report, null, 2) + "\n", { mode: 0o600, flag:"wx" });
  console.log(JSON.stringify({
    status: report.status,
    snapshotPath: target,
    manifestPath: manifestFile,
    bytes: report.sizeBytes,
    sha256: report.sha256,
    integrity: report.integrityCheck,
    foreignKeyViolations: report.foreignKeyViolations,
    tableCount: Object.keys(report.rowCounts).length
  }));
  if (report.status !== "PASS") process.exitCode = 2;
})().catch((err) => {
  console.error("BACKUP_FAILED:", err.message);
  process.exitCode = 1;
});
