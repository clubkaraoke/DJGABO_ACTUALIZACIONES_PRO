#!/usr/bin/env python3
"""Preparar SQL desde snapshot SQLite consistente, respetando claves foráneas.

El SQL contiene datos privados de clientes; NUNCA ponerlo en GitHub.
No modifica la copia SQLite ni envía información por red.

Uso: python prepare-d1.py ruta/snapshot.sqlite --out-dir CARPETA_PRIVADA
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import sys


def qident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def table_descriptions(db: sqlite3.Connection) -> dict:
    return dict(db.execute(
        "SELECT name, sql FROM sqlite_master WHERE type='table' "
        "AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).fetchall())


def insertion_order(db: sqlite3.Connection, tables: dict) -> list[str]:
    names = set(tables)
    dependencies = {}
    for name in tables:
        deps = {
            row[2] for row in db.execute(f"PRAGMA foreign_key_list({qident(name)})")
            if row[2] in names
        }
        deps.discard(name)
        dependencies[name] = deps
    output = []
    state = {}

    def visit(name: str):
        mark = state.get(name, 0)
        if mark == 2:
            return
        if mark == 1:
            raise RuntimeError(f"Ciclo entre tablas detectado cerca de: {name}")
        state[name] = 1
        for parent in sorted(dependencies[name]):
            visit(parent)
        state[name] = 2
        output.append(name)

    for name in sorted(tables):
        visit(name)
    return output


def inventory(db: sqlite3.Connection, tables: dict) -> dict:
    counts = {}
    for name in sorted(tables):
        counts[name] = db.execute(
            f"SELECT COUNT(*) FROM {qident(name)}"
        ).fetchone()[0]
    integrity = db.execute("PRAGMA integrity_check").fetchone()[0]
    fk_violations = len(list(db.execute("PRAGMA foreign_key_check")))
    return {
        "integrityCheck": integrity,
        "foreignKeyViolations": fk_violations,
        "tableCount": len(tables),
        "rowCounts": counts,
    }


def write_sql(db: sqlite3.Connection, target: Path, tables: dict, order: list[str]) -> None:
    with target.open("x", encoding="utf-8", newline="\n") as out:
        out.write("-- Exportación privada de DJGABO para D1. NO SUBIR A GIT.\n")
        # Las tablas deben existir antes de cualquier INSERT.
        for name in sorted(tables):
            statement = tables[name]
            if not statement or "VIRTUAL TABLE" in statement.upper():
                raise RuntimeError("Tablas virtuales requieren un exportador especializado")
            out.write(statement.rstrip().rstrip(";") + ";\n")

        # El orden de inserción de datos coloca primero las tablas referenciadas.
        for name in order:
            cols = [
                row[1] for row in db.execute(f"PRAGMA table_xinfo({qident(name)})")
                if row[6] == 0
            ]
            if not cols:
                raise RuntimeError(f"No se pudieron enumerar las columnas: {name}")
            columns = ", ".join(qident(col) for col in cols)
            quoted_values = ", ".join(
                f"quote({qident(col)})" for col in cols
            )
            sql = (
                f"SELECT {quoted_values} FROM {qident(name)}"
            )
            prefix = f"INSERT INTO {qident(name)} ({columns}) VALUES ("
            for row in db.execute(sql):
                if any(v is None for v in row):
                    raise RuntimeError(f"No se pudo exportar una celda: {name}")
                out.write(prefix + ", ".join(row) + ");\n")

        # Índices, vistas y triggers se crean DESPUÉS de insertar los datos,
        # para evitar ejecuciones de triggers durante la restauración.
        for kind in ("index", "view", "trigger"):
            for name, statement in db.execute(
                "SELECT name, sql FROM sqlite_master "
                "WHERE type=? AND sql IS NOT NULL ORDER BY name", (kind,)
            ):
                if name.startswith("sqlite_") or name == "_cf_KV":
                    continue
                out.write(statement.rstrip().rstrip(";") + ";\n")
    os.chmod(target, 0o600)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("snapshot", type=Path)
    parser.add_argument("--out-dir", type=Path, required=True)
    args = parser.parse_args()
    source = args.snapshot.resolve(strict=True)
    dest = args.out_dir.resolve()
    dest.mkdir(parents=True, exist_ok=True, mode=0o700)
    sql_path = dest / "djgabo-d1-import.sql"
    report_path = dest / "djgabo-d1-inventory.json"
    if sql_path.exists() or report_path.exists():
        raise FileExistsError("Archivos de salida existentes: elegir otro directorio privado")
    db = sqlite3.connect(f"{source.as_uri()}?mode=ro", uri=True)
    try:
        tables = table_descriptions(db)
        if "_cf_KV" in tables:
            raise RuntimeError("Tabla reservada _cf_KV detectada")
        report = inventory(db, tables)
        if report["integrityCheck"] != "ok" or report["foreignKeyViolations"] != 0:
            raise RuntimeError("Snapshot no pasa integridad/FK: exportación cancelada")
        order = insertion_order(db, tables)
        write_sql(db, sql_path, tables, order)
    finally:
        db.close()

    data = {
        "snapshotFile": source.name,
        "snapshotSha256": digest(source),
        "exportSqlSha256": digest(sql_path),
        "exportSqlBytes": sql_path.stat().st_size,
        "parentFirstInsertOrder": order,
        **report,
    }
    with report_path.open("x", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")
    os.chmod(report_path, 0o600)
    print(json.dumps({
        "status":"PASS", "tables": data["tableCount"],
        "sqlBytes": data["exportSqlBytes"],
        "sqlSha256": data["exportSqlSha256"],
        "integrity": data["integrityCheck"],
        "foreignKeyViolations": data["foreignKeyViolations"],
        "reportPath":str(report_path),
        "sqlPath":str(sql_path),
    }, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as err:
        print(f"MIGRATION_PREP_FAILED: {err}", file=sys.stderr)
        sys.exit(1)
