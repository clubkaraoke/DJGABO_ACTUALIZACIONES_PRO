#!/usr/bin/env python3
"""Diagnose HTTP statuses of synthetic lab login without exposing credentials or tokens."""
import json
import urllib.request
import urllib.error
from pathlib import Path
BASE="https://djgabo-actualizaciones-cloudflare-lab.clubkaraokedjgabo.workers.dev"
HOME=Path.home()/"Documents"/"DJGABO_Migracion_Privada_20261109"
gate=(HOME/"cloudflare_lab_gate.txt").read_text(encoding="utf-8").strip()
credentials=json.loads((HOME/"lab-test-credentials.json").read_text(encoding="utf-8"))
def call(method,path,body=None):
    raw=json.dumps(body).encode() if body is not None else None
    req=urllib.request.Request(BASE+path,data=raw,method=method,headers={
        "User-Agent":"curl/8.0","X-Lab-Key":gate,"Content-Type":"application/json"
    })
    try:
        with urllib.request.urlopen(req,timeout=30) as response:
            data=response.read(1048576)
            try: response_body=json.loads(data) if data else {}
            except: response_body={}
            return response.status,response_body
    except urllib.error.HTTPError as error:
        try:response_body=json.loads(error.read(4096))
        except:response_body={}
        return error.code,response_body
for label,method,path,body in [
    ("me_no_token","GET","/api/auth/me",None),
    ("vip_no_token","GET","/api/collections",None),
    ("wrong_password","POST","/api/auth/login",{"email":credentials["email"],"password":"incorrect"}),
    ("valid_login","POST","/api/auth/login",{"email":credentials["email"],"password":credentials["password"]})
]:
    status,body=call(method,path,body)
    print(json.dumps({"test":label,"status":status,"errorCode":body.get("error"),
                      "hasAccessToken":bool(body.get("accessToken")),
                      "hasRefreshToken":bool(body.get("refreshToken"))}))
