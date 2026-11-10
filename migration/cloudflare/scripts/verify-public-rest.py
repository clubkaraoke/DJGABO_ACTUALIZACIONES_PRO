#!/usr/bin/env python3
"""Verificar paridad de API pública Railway vs Cloudflare LAB sin mostrar datos privados."""
import json
import urllib.request
from urllib.parse import urlencode

RAILWAY="https://djgabo-actualizaciones-webapi-production.up.railway.app"
CLOUDFLARE="https://djgabo-actualizaciones-cloudflare-lab.clubkaraokedjgabo.workers.dev"
def get(base,path):
    req=urllib.request.Request(base+path,headers={"User-Agent":"curl/8.0","Accept":"application/json"})
    with urllib.request.urlopen(req,timeout=30) as r:return json.load(r)

def compare(label,path):
    a,b=get(RAILWAY,path),get(CLOUDFLARE,path)
    different=[i for i,(x,y) in enumerate(zip(a,b)) if x!=y] if isinstance(a,list) and isinstance(b,list) else []
    same=a==b
    return {"endpoint":label,"match":same,"railway":len(a) if isinstance(a,list) else len(a.get("karaokes",[])),
      "cloudflare":len(b) if isinstance(b,list) else len(b.get("karaokes",[])),
      "diffCount":len(different) if isinstance(a,list) and isinstance(b,list) else (0 if same else 1)},a,b

def main():
    checks=[]
    item,collections,_=compare("public/collections","/api/public/collections")
    checks.append(item)
    picked=[]
    for year,month in [(2012,0),(2021,12),(2025,11),(2026,9),(2026,10)]:
        col=next((c for c in collections if c["year"]==year and c["month"]==month and not c["preparing"]),None)
        if col:
            item,a,b=compare("collection-%04d-%02d"%(year,month),"/api/public/collections/"+col["id"])
            # also compare collection summary DTO
            item["summaryMatch"]=a.get("collection")==b.get("collection")
            item["match"]=a==b
            checks.append(item)
            picked.append(col["id"])
    qs=[
        {"q":"suave"},{"q":"luis","sort":"artist"},
        {"q":"cumbia","sort":"recent"},{"collectionId":picked[-1],"sort":"title"} if picked else {"q":"voz"}
    ]
    for i,q in enumerate(qs):
        item,*_=compare("search-%d"%(i+1),"/api/public/karaokes/search?"+urlencode(q))
        checks.append(item)
    print(json.dumps({"status":"PASS" if all(c["match"] for c in checks) else "REVIEW",
        "checks":checks},ensure_ascii=False))
if __name__=="__main__":main()
