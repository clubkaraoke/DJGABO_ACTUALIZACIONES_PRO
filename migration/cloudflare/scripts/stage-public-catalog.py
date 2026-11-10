#!/usr/bin/env python3
"""Extraer exclusivamente JSON públicos del catálogo de un tar de Railway.

Origen: backup tar /data/catalog.
Destino: directorio local de assets de Cloudflare Workers.
No extrae archivos privados ni tokens. Reescribe JSON con campos públicos
permitidos. No expone datos de usuarios, cuotas, pagos o Dropbox paths.

Uso:
 python stage-public-catalog.py --archive catalog.tar.gz --out-dir /RUTA/Worker/public-catalog
"""
import argparse
import json
from pathlib import Path
import re
import sys
import tarfile

MONTH = re.compile(r"^catalog/(20\d{2})/(0[0-9]|1[0-2])/index\.json$")
VERSION = "catalog/version.json"
VERSION_KEYS = {"schema_version", "version", "updated_at", "years"}
MONTH_KEYS = {"schema_version", "version", "updated_at", "year", "month", "collection", "brands", "karaokes"}
COLLECTION_KEYS = {"id", "slug", "title", "cover_url", "active"}
BRAND_KEYS = {"name", "slug", "count"}
KARAOKE_KEYS = {"id", "code", "artist", "title", "format", "size", "cover_url", "brand"}

def keep(obj, fields):
    if not isinstance(obj, dict):
        raise ValueError("JSON debe contener un objeto")
    return {key: obj[key] for key in obj if key in fields}

def clean_version(value):
    data = keep(value, VERSION_KEYS)
    if data.get("schema_version") != 1 or not isinstance(data.get("years"), list):
        raise ValueError("version.json no sigue schema_version 1")
    return data

def clean_month(value, yr, mo):
    data = keep(value, MONTH_KEYS)
    if data.get("schema_version") != 1 or data.get("year") != yr or data.get("month") != mo:
        raise ValueError("Año/mes del archivo no coincide con su contenido")
    col = data.get("collection")
    if col is not None:
        data["collection"] = keep(col, COLLECTION_KEYS)
    brands = data.get("brands")
    karaokes = data.get("karaokes")
    if not isinstance(brands, list) or not isinstance(karaokes, list):
        raise ValueError("Faltan arrays públicos de marcas/karaokes")
    data["brands"] = [keep(item, BRAND_KEYS) for item in brands]
    data["karaokes"] = [keep(item, KARAOKE_KEYS) for item in karaokes]
    return data

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--archive", type=Path, required=True)
    p.add_argument("--out-dir", type=Path, required=True)
    args=p.parse_args()
    output=args.out_dir.resolve()
    if output.exists() and any(output.iterdir()):
        raise FileExistsError("Directorio de salida no está vacío: evita sobrescribir datos")
    output.mkdir(parents=True, exist_ok=True)
    months = 0
    karaoke_total = 0
    version_found = False
    with tarfile.open(args.archive, "r:gz") as tar:
        for member in tar:
            if not member.isfile():
                continue
            if member.size > 8 * 1024 * 1024:
                raise ValueError("Archivo del catálogo supera límite seguro")
            name=member.name.replace("\\", "/").lstrip("./")
            match=MONTH.fullmatch(name)
            if name != VERSION and not match:
                continue  # PRIVADO: no se extrae
            raw=tar.extractfile(member)
            if raw is None:
                raise ValueError("No se pudo leer archivo del catálogo")
            data=json.loads(raw.read().decode("utf-8"))
            if name == VERSION:
                value=clean_version(data)
                dest=output/"version.json"
                version_found=True
            else:
                yr,mo=int(match.group(1)),int(match.group(2))
                value=clean_month(data,yr,mo)
                dest=output/str(yr)/f"{mo:02d}"/"index.json"
                months+=1
                karaoke_total+=len(value["karaokes"])
            dest.parent.mkdir(parents=True,exist_ok=True)
            dest.write_text(json.dumps(value,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    if not version_found or months < 1:
        raise ValueError("Respaldo incompleto: versión/meses no encontrados")
    print(json.dumps({
        "status":"PASS","versionFound":version_found,
        "monthFiles":months,"publicKaraokeEntries":karaoke_total,
        "outputDir":str(output),
        "note":"Se descartaron todos los archivos JSON privados."
    },ensure_ascii=False))

if __name__=="__main__":
    try: main()
    except Exception as exc:
        print("STAGE_PUBLIC_CATALOG_FAILED:",str(exc),file=sys.stderr)
        sys.exit(1)
