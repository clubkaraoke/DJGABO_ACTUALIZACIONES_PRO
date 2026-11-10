#!/usr/bin/env python3
"""Validación local del SQL privado antes de importar a Cloudflare D1.
No envía información a Internet. NUNCA mostrar filas o exportar datos a Git.
USO: python validate-d1-sql.py --sql privado.sql --inventory privado.json
"""
import argparse
import json
from pathlib import Path
import sqlite3
import sys

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--sql", type=Path, required=True)
    p.add_argument("--inventory", type=Path, required=True)
    args = p.parse_args()
    expected = json.loads(args.inventory.read_text(encoding="utf-8"))
    sql = args.sql.read_text(encoding="utf-8")
    db = sqlite3.connect(":memory:")
    try:
        db.execute("PRAGMA foreign_keys=ON")
        db.executescript(sql)
        counts = {}
        for name in expected["rowCounts"]:
            quoted = '"' + name.replace('"', '""') + '"'
            counts[name] = db.execute(f"SELECT COUNT(*) FROM {quoted}").fetchone()[0]
        integrity = db.execute("PRAGMA integrity_check").fetchone()[0]
        fks = list(db.execute("PRAGMA foreign_key_check"))
        if counts != expected["rowCounts"] or integrity != "ok" or fks:
            raise RuntimeError(
                f"Paridad fallida: counts={counts == expected['rowCounts']}, "
                f"integrity={integrity}, foreignKeyViolations={len(fks)}"
            )
        print(json.dumps({"status":"PASS", "tables":len(counts),
                          "rows":sum(counts.values()), "integrity":integrity,
                          "foreignKeyViolations":0}))
    finally:
        db.close()

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"VALIDATION_FAILED: {exc}", file=sys.stderr)
        sys.exit(1)
