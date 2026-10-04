# CHECKPOINT — VIP Karaoke Hub — Base44 export migration

Fecha: 2026-10-04

## Origen
- Export Base44 appId: `6abde375d8dd425da9cb52fa`
- Export generado: `2026-10-04T10:20:25.099Z`
- 127 archivos reportados por Base44
- Frontend: React + Vite + Tailwind

## Repo destino
- `clubkaraoke/DJGABO_ACTUALIZACIONES_PRO`
- Rama fuente protegida: `staging`
- HEAD al iniciar migración: `76df2f80c9798c93666c58bb91b3182b2461e48b`
- Rama de trabajo: `migration/vip-base44-export-20261004`

## Hallazgos del export
1. El diseño y las páginas principales están presentes en `src/`.
2. Base44 exportó `src/api/base44Client.js` como stub sin funcionalidad real.
3. El frontend aún importa funciones `@/functions/*` que en el export no existen dentro de `src`.
4. `vite.config.js` conserva configuración dependiente del plugin Base44.
5. Las funciones Base44 exportadas incluyen:
   - catalogoActualizaciones
   - descargaStatus
   - descargaTicket
   - dispositivoRegistro
   - railwayAuthBridge
6. El flujo de descarga ya apunta al backend Railway:
   `https://djgabo-actualizaciones-webapi-production.up.railway.app`

## Backend confirmado en staging
Railway ya dispone de:
- autenticación propia: `/api/auth/login`, `/api/auth/refresh`, `/api/auth/logout`, `/api/auth/me`
- dispositivos
- colecciones
- catálogos
- tickets de descarga
- streaming seguro
- límites/autorización
- administración
- Dropbox privado

También conserva el puente `/api/auth/base44/exchange`, pero la migración fuera de Base44 debe dejar de depender de ese puente y usar autenticación Railway directamente.

## Estrategia sellada
- NO tocar `staging` durante la migración.
- NO reescribir Railway/Dropbox.
- Usar el `apps/web` existente del monorepo como destino.
- Conservar la lógica sólida de API/auth/device/download del frontend existente.
- Sustituir la interfaz antigua de `apps/web` por la UI exportada de Base44.
- Eliminar dependencia de `@base44/sdk`, funciones Base44 y runtime Base44 del frontend nuevo.
- Validar primero catálogo + login + dispositivo + ticket + descarga ZIP end-to-end.
