#!/usr/bin/env python3
"""Construye BD de prueba local desde DDL del snapshot real, SIN copiar datos.
Las contraseñas/tokens falsos se crean después con seed-local-fixture.mjs.

Uso: python build-local-schema.py SNAPSHOT.sqlite OUT.sql
"""
import sqlite3,sys
from pathlib import Path
if len(sys.argv)!=3: raise SystemExit("Uso: python build-local-schema.py SNAPSHOT.sqlite OUT.sql")
snapshot=Path(sys.argv[1]).resolve(strict=True);dest=Path(sys.argv[2]).resolve()
if dest.exists(): raise SystemExit("El SQL de destino existe; no sobreescribir")
db=sqlite3.connect(f"{snapshot.as_uri()}?mode=ro",uri=True)
try:
    ddl=list(db.execute("SELECT type,name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND sql IS NOT NULL ORDER BY name"))
    indexes=list(db.execute("SELECT type,name,sql FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' AND sql IS NOT NULL ORDER BY name"))
    for kind,name,sql in ddl+indexes:
        if "VIRTUAL TABLE" in sql.upper(): raise ValueError("Tabla virtual necesita revisión")
    output=["-- SOLO ESTRUCTURA, NO datos de clientes. Importar solo en wrangler --local"]
    output += [sql.rstrip().rstrip(";")+";" for _,_,sql in ddl+indexes]
    output += ["CREATE TABLE IF NOT EXISTS lab_auth_rate (key TEXT PRIMARY KEY,window_start INTEGER NOT NULL,attempts INTEGER NOT NULL);"]
    output += ["CREATE INDEX IF NOT EXISTS lab_auth_rate_window_idx ON lab_auth_rate(window_start);"]
    dest.write_text("\n".join(output)+"\n",encoding="utf-8")
    print("LOCAL_DDL_READY tables=%d indexes=%d"%(len(ddl),len(indexes)))
finally: db.close()
