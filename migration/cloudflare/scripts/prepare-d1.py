#!/usr/bin/env python3
"""Prepara un .sql desde una COPIA consistente de SQLite para D1.
Nunca lee ni modifica la base en vivo. El SQL generado contiene PII.
USO: python prepare-d1.py backup.sqlite --out-dir DIR-PRIVADO
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import sys

def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def inventory(con: sqlite3.Connection):
    tables = [
        row[0] for row in con.execute(
            "SELECT name FROM sqlite_master WHERE type='table' "
            "AND name NOT LIKE 'sqlite_%' ORDER BY name"
        )
    ]
    counts = {}
    for name in tables:
        quoted = '"' + name.replace('"', '""') + '"'
        counts[name] = con.execute(f"SELECT COUNT(*) FROM {quoted}").fetchone()[0]
    integrity = con.execute("PRAGMA integrity_check").fetchone()[0]
    fk = list(con.execute("PRAGMA foreign_key_check"))
    return {"integrityCheck": integrity,
            "foreignKeyViolations": len(fk),
            "tableCount": len(tables),
            "rowCounts": counts}

def export_sql(con: sqlite3.Connection, dest: Path):
    # Cloudflare D1 requiere SQL de texto, NO el binario .sqlite.
    # Documentación: developers.cloudflare.com/d1/best-practices/import-export-data/
    with dest.open("x", encoding="utf-8", newline="\n") as f:
        f.write("-- EXPORTACIÓN PRIVADA: incluye datos de clientes. NO SUBIR A GIT.\n")
        for line in con.iterdump():
            cleaned = line.strip()
            if cleaned in ("BEGIN TRANSACTION;", "COMMIT;"):
                continue
            if "_cf_KV" in cleaned:
                raise ValueError("Tabla reservada _cf_KV detectada: requiere limpieza manual")
            f.write(line + "\n")
    os.chmod(dest, 0o600)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("snapshot", type=Path)
    parser.add_argument("--out-dir", type=Path, required=True)
    args = parser.parse_args()
    source = args.snapshot.resolve(strict=True)
    outdir = args.out_dir.resolve()
    outdir.mkdir(parents=True, exist_ok=True, mode=0o700)
    export_path = outdir / "djgabo-d1-import.sql"
    report_path = outdir / "djgabo-d1-inventory.json"
    if export_path.exists() or report_path.exists():
        raise FileExistsError("Archivos de salida ya existen; no se sobreescriben")
    con = sqlite3.connect(f"{source.as_uri()}?mode=ro", uri=True)
    try:
        info = inventory(con)
        if info["integrityCheck"] != "ok" or info["foreignKeyViolations"]:
            raise RuntimeError("Snapshot no pasa integridad/FK; NO exportar")
        export_sql(con, export_path)
    finally:
        con.close()
    report = {
        "snapshotFile": source.name,
        "snapshotSha256": digest(source),
        "exportSqlSha256": digest(export_path),
        "exportSqlBytes": export_path.stat().st_size,
        **info
    }
    with report_path.open("x", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
        f.write("\n")
    os.chmod(report_path, 0o600)
    print(json.dumps({
        "status": "PASS",
        "tables": report["tableCount"],
        "sqlBytes": report["exportSqlBytes"],
        "sqlSha256": report["exportSqlSha256"],
        "integrity": report["integrityCheck"],
        "foreignKeyViolations": report["foreignKeyViolations"],
        "reportPath": str(report_path),
        "sqlPath": str(export_path),
    }, ensure_ascii=False))

if __name__ == "__main__":
    try:
        main()
    except Exception as err:
        print(f"MIGRATION_PREP_FAILED: {err}", file=sys.stderr)
        sys.exit(1)
