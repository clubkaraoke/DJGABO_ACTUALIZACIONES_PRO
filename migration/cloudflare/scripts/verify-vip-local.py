#!/usr/bin/env python3
"""Smoke test LOCAL contra Wrangler dev y una cuenta sintética.
Solo 127.0.0.1. No escribe en D1 remoto ni imprime claves.
"""
import json
import sys
from pathlib import Path
import urllib.request
import urllib.error
BASE="http://127.0.0.1:8898"
PRIVATE=Path.home()/"Documents"/"DJGABO_Migracion_Privada_20261109"
CREDS=json.loads((PRIVATE/"lab-local-credentials.json").read_text(encoding="utf-8"))
GATE=CREDS["gate"]

def call(method,path,body=None,token=None,gate=True):
    payload=json.dumps(body).encode("utf-8") if body is not None else None
    headers={"User-Agent":"DJGABO-Test/1","Content-Type":"application/json"}
    if gate:headers["X-Lab-Key"]=GATE
    if token:headers["Authorization"]="Bearer "+token
    req=urllib.request.Request(BASE+path,data=payload,method=method,headers=headers)
    try:
        with urllib.request.urlopen(req,timeout=15) as r:
            content=r.read()
            return r.status,json.loads(content) if content else {}
    except urllib.error.HTTPError as err:
        try:body=json.loads(err.read(4096))
        except Exception:body={}
        return err.code,body
def assert_code(actual,expected,label):
    if actual!=expected:raise AssertionError(f"{label}: HTTP {actual}, expected {expected}")
def main():
    x,_=call("GET","/api/auth/me",gate=False);assert_code(x,404,"Gate denied")
    x,_=call("GET","/api/auth/me");assert_code(x,401,"Missing JWT")
    x,_=call("POST","/api/auth/login",{"email":CREDS["email"],"password":"bad"})
    assert_code(x,401,"Invalid password")
    x,session=call("POST","/api/auth/login",{"email":CREDS["email"],"password":CREDS["password"]})
    assert_code(x,200,"Valid login")
    token=session["accessToken"]
    assert session["user"]["id"]==CREDS["id"]
    x,me=call("GET","/api/auth/me",token=token);assert_code(x,200,"Me")
    assert me["id"]==CREDS["id"]
    x,collections=call("GET","/api/collections",token=token)
    assert_code(x,200,"VIP list")
    assert len(collections)==1 and not collections[0]["locked"]
    x,detail=call("GET","/api/collections/"+CREDS["collectionId"],token=token)
    assert_code(x,200,"VIP detail")
    assert detail["collection"]["id"]==CREDS["collectionId"]
    x,_=call("GET","/api/collections/no-such-collection",token=token)
    assert_code(x,403,"Unauthorized collection")
    deviceCodes=[]
    for j in range(4):
        code,_=call("POST","/api/devices/register",{"deviceName":"Equipo ficticio "+str(j)},token=token)
        deviceCodes.append(code)
    assert deviceCodes==[201,201,201,409],f"Device limit mismatch {deviceCodes}"
    x,nextTokens=call("POST","/api/auth/refresh",{"refreshToken":session["refreshToken"]})
    assert_code(x,200,"Refresh")
    x,_=call("POST","/api/auth/refresh",{"refreshToken":session["refreshToken"]})
    assert_code(x,401,"Reuse old refresh")
    x,_=call("POST","/api/auth/logout",{"refreshToken":nextTokens["refreshToken"]})
    assert_code(x,204,"Logout")
    x,_=call("POST","/api/auth/refresh",{"refreshToken":nextTokens["refreshToken"]})
    assert_code(x,401,"Revoked refresh")
    print(json.dumps({"status":"PASS","backend":"LOCAL_ONLY","realCustomers":0,
      "login":True,"me":True,"collections":len(collections),
      "devices":deviceCodes,"refreshRotated":True,"logout":True}))
if __name__=="__main__":
    try:main()
    except Exception as e:
        print(json.dumps({"status":"FAIL","error":str(e)}),file=sys.stderr)
        sys.exit(1)
