import json,urllib.request,collections
from urllib.parse import urlencode
A="https://djgabo-actualizaciones-webapi-production.up.railway.app"
B="https://djgabo-actualizaciones-cloudflare-lab.clubkaraokedjgabo.workers.dev"
def get(url):
    request=urllib.request.Request(url,headers={"User-Agent":"curl/8.0"})
    with urllib.request.urlopen(request,timeout=30) as f:return json.load(f)
def check(label,path,detail=False):
    a=get(A+path);b=get(B+path)
    x=a["karaokes"] if detail else a
    y=b["karaokes"] if detail else b
    ida={v["id"]:v for v in x}; idb={v["id"]:v for v in y}
    common=set(ida)&set(idb)
    fields=collections.Counter()
    for key in common:
        for field in set(ida[key])|set(idb[key]):
            if ida[key].get(field)!=idb[key].get(field):fields[field]+=1
    print(json.dumps({"label":label,"sizeA":len(x),"sizeB":len(y),
        "sameIds":set(ida)==set(idb),
        "missingA":len(set(idb)-set(ida)),"missingB":len(set(ida)-set(idb)),
        "fieldDiffs":fields,"positionDiffs":sum(p["id"]!=q["id"] for p,q in zip(x,y))},ensure_ascii=False))
for yr,mo in [(2026,10),(2026,9)]:
    allcols=get(A+"/api/public/collections")
    col=next(c for c in allcols if c["year"]==yr and c["month"]==mo)
    check("detail-%04d-%02d"%(yr,mo),"/api/public/collections/"+col["id"],True)
for q in ({"q":"luis","sort":"artist"},{"q":"cumbia","sort":"recent"}):
    check(str(q),"/api/public/karaokes/search?"+urlencode(q))
