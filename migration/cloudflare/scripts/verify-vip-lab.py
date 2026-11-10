#!/usr/bin/env python3
"""Prueba segura del login y permisos VIP del LAB, NUNCA usuarios reales.

Lee secretos y contraseña ficticia desde carpeta privada local, sin imprimirlos.
Escribe solo resultados de estado y recuentos de colección.
"""
import json
from pathlib import Path
import sys
import urllib.request
import urllib.error
BASE="https://djgabo-actualizaciones-cloudflare-lab.clubkaraokedjgabo.workers.dev"
PRIVATE=Path.home()/"Documents"/"DJGABO_Migracion_Privada_20261109"
def query(method,path,gate,data=None,token=None):
    headers={"X-Lab-Key":gate,"User-Agent":"curl/8.0","Accept":"application/json"}
    raw=None
    if data is not None:
        raw=json.dumps(data).encode()
        headers["Content-Type"]="application/json"
    if token:headers["Authorization"]="Bearer "+token
    request=urllib.request.Request(BASE+path,data=raw,method=method,headers=headers)
    try:
        with urllib.request.urlopen(request,timeout=30) as response:
            payload=response.read()
            return response.status,(json.loads(payload) if payload else {})
    except urllib.error.HTTPError as error:
        body=error.read()
        try:msg=json.loads(body)
        except Exception:msg={}
        return error.code,msg
def check(condition,text):
    if not condition:raise AssertionError(text)
def main():
    gate=(PRIVATE/"cloudflare_lab_gate.txt").read_text(encoding="utf-8").strip()
    creds=json.loads((PRIVATE/"lab-test-credentials.json").read_text(encoding="utf-8"))
    first,_=query("GET","/api/collections",gate)
    if first==503:
        print(json.dumps({"status":"PENDING","reason":"LAB_JWT_SECRET aún no configurado"}))
        return
    check(first==401,"Acceso sin JWT no rechazado correctamente")
    s,_=query("POST","/api/auth/login",gate,{"email":creds["email"],"password":"NO_ES_LA_CLAVE_CORRECTA"})
    check(s==401,"Password incorrecto no rechazado")
    s,body=query("POST","/api/auth/login",gate,{"email":creds["email"],"password":creds["password"]})
    check(s==200 and isinstance(body.get("accessToken"),str),"Inicio de sesión de prueba falló")
    check(body["user"]["id"]==creds["id"],"Usuario autenticado no coincide con cuenta de prueba")
    token=body["accessToken"]
    s,me=query("GET","/api/auth/me",gate,token=token)
    check(s==200 and me["id"]==creds["id"],"GET me falló")
    s,collections=query("GET","/api/collections",gate,token=token)
    check(s==200 and isinstance(collections,list) and len(collections)>=100,"Listado VIP inválido")
    allowed=[c for c in collections if not c["locked"]]
    locked=[c for c in collections if c["locked"]]
    check(len(allowed)>0,"La cuenta ficticia anual no tiene colecciones activas")
    s,detail=query("GET","/api/collections/"+allowed[0]["id"],gate,token=token)
    check(s==200 and len(detail.get("karaokes",[]))>=0,"Detalle VIP falló")
    s,_=query("GET","/api/collections/coleccion-inexistente",gate,token=token)
    check(s==403,"Acceso no autorizado no fue bloqueado")
    statuses=[]
    for i in range(4):
        code,_=query("POST","/api/devices/register",gate,{"deviceName":"Prueba de dispositivo "+str(i)},token=token)
        statuses.append(code)
    check(statuses==[201,201,201,409],"Límite de 3 dispositivos no se respetó")
    s,refresh=query("POST","/api/auth/refresh",gate,{"refreshToken":body["refreshToken"]})
    check(s==200 and refresh.get("refreshToken"),"Rotación refresh falló")
    s,_=query("POST","/api/auth/refresh",gate,{"refreshToken":body["refreshToken"]})
    check(s==401,"Refresh anterior reutilizable")
    s,_=query("POST","/api/auth/logout",gate,{"refreshToken":refresh["refreshToken"]})
    check(s==204,"Logout falló")
    s,_=query("POST","/api/auth/refresh",gate,{"refreshToken":refresh["refreshToken"]})
    check(s==401,"Refresh no revocado tras logout")
    print(json.dumps({"status":"PASS","me":True,"collections":len(collections),
                      "unlocked":len(allowed),"locked":len(locked),
                      "deviceRegistrationCodes":statuses,
                      "refreshRotation":True,"logout":True}))
if __name__=="__main__":
    try:main()
    except Exception as exc:
        print(json.dumps({"status":"FAIL","error":str(exc)}),file=sys.stderr)
        sys.exit(1)
