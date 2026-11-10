#!/usr/bin/env python3
"""Compara JSON públicos de Railway vs LAB de Cloudflare (solo lectura).
Imprime recuentos, NO títulos de canciones ni datos de clientes.
"""
import json
import urllib.request
import urllib.error
from hashlib import sha256
import sys

RAILWAY="https://djgabo-actualizaciones-webapi-production.up.railway.app"
CLOUDFLARE="https://djgabo-actualizaciones-cloudflare-lab.clubkaraokedjgabo.workers.dev"
SAMPLES=[(2012,0),(2015,5),(2021,12),(2024,8),(2025,11),(2026,9),(2026,10),(2026,11)]
def get(url):
    req=urllib.request.Request(url,headers={"User-Agent":"curl/8.0","Accept":"application/json"})
    with urllib.request.urlopen(req,timeout=30) as response:
        return json.load(response)
def fingerprint(rows):
    canonical=[
        [str(row.get(key)) for key in ("id","code","artist","title","format","brand")]
        for row in rows
    ]
    return sha256(json.dumps(canonical,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
def main():
    records=[]
    all_equal=True
    for year,month in SAMPLES:
        path="/api/catalog/%d/%02d/index.json"%(year,month)
        a=get(RAILWAY+path);b=get(CLOUDFLARE+path)
        a_rows=a.get("karaokes",[]);b_rows=b.get("karaokes",[])
        equal=fingerprint(a_rows)==fingerprint(b_rows)
        compatible= a.get("schema_version")==b.get("schema_version")==1 and a.get("year")==b.get("year") and a.get("month")==b.get("month")
        records.append({"month":"%04d-%02d"%(year,month),"railway":len(a_rows),"cloudflare":len(b_rows),"sameRecords":equal,"compatibleSchema":compatible})
        all_equal=all_equal and equal and compatible
    print(json.dumps({"status":"MATCH" if all_equal else "DRIFT","samples":records},ensure_ascii=False))
    if not all_equal:
        print("NOTE: la copia del LAB es una foto; Railway puede haber cambiado desde el respaldo.",file=sys.stderr)
if __name__=="__main__":
    main()
