# Autorización — DJGABO ACTUALIZACIONES PRO

Toda regla de acceso vive en **una sola clase**:
`packages/domain/src/AuthorizationService.ts`. Ninguna ruta de la API ni
componente de React debe reimplementar estas reglas.

## Métodos

### `canAccessCollection(userId, collectionId)`
1. El usuario existe.
2. El usuario no está `SUSPENDED`.
3. El usuario no está `EXPIRED` por `status` **ni** por fecha
   (`subscriptionEnd < ahora`, aunque el `status` diga `ACTIVE` — doble
   verificación, ver el usuario demo `ana@demo.com`).
4. La colección existe y está `active`.
5. Si el usuario es `ADMIN`, se permite sin más (el panel admin necesita ver
   todas las colecciones activas).
6. Si es `MEMBER`, debe existir un `UserCollectionAccess` con
   `enabled=true` y (`expiresAt` nulo o en el futuro).

### `canPreviewKaraoke(userId, karaokeId)`
Resuelve la colección del karaoke y aplica `canAccessCollection`. Además
exige que el karaoke tenga `previewAssetId`.

### `canDownloadKaraoke(userId, karaokeId, deviceId?)`
Igual que preview, pero exige `masterAssetId` y aplica el límite de
dispositivos (ver abajo).

### `canDownloadCollection(userId, collectionId, deviceId?)`
Aplica `canAccessCollection` + límite de dispositivos. Los karaokes sin
`masterAsset` simplemente se excluyen del total (nunca rompen la descarga
completa).

## Límite de dispositivos

- Si no se envía `deviceId`, no se aplica el límite (por ejemplo, el
  listado de colecciones no necesita dispositivo).
- Si el `deviceId` ya está registrado (`DeviceSession` existente), siempre
  se permite, sin importar cuántos dispositivos tenga el usuario — evita
  que un cliente quede bloqueado de su propio dispositivo habitual.
- Si es un `deviceId` nuevo, se cuenta cuántos dispositivos activos
  distintos tiene el usuario; si ya alcanzó `maxDevices`, se rechaza con
  `DEVICE_LIMIT_REACHED` (HTTP 409).
- El registro del dispositivo (`DeviceSession`) ocurre **después** de que
  `AuthorizationService` aprueba la descarga, nunca antes — así el propio
  chequeo de límite no se contamina con el dispositivo que se está
  registrando en ese momento.

### El deviceId ya no lo elige el cliente (endurecido)

Versión anterior: el frontend generaba un UUID en `localStorage` y lo
mandaba tal cual en el body de cada descarga. Fallo real: cualquiera podía
copiar/inventar un `deviceId` "conocido" y usarlo en instalaciones
ilimitadas — como `isDeviceKnown` siempre permite un dispositivo ya
conocido sin tope, el límite quedaba completamente evadido.

Modelo actual:

1. El cliente pide un dispositivo nuevo a `POST /api/devices/register` (sin
   poder elegir su ID).
2. `AuthorizationService.canRegisterDevice(userId)` decide si hay cupo —
   **la misma regla de negocio**, aplicada en el registro en vez de en cada
   descarga.
3. Si hay cupo, el servidor genera el `deviceId` (aleatorio, no
   adivinable), crea el `DeviceSession`, y firma un JWT
   `{ deviceId, userId }` con `DEVICE_TOKEN_SECRET` — un secreto que el
   cliente nunca tiene.
4. Cada descarga debe enviar ese token en el header `X-Device-Token`. El
   servidor verifica la firma, que `userId` coincida con la sesión
   autenticada actual, y que el `DeviceSession` siga `active` en la base de
   datos — recién entonces usa el `deviceId` verificado para
   `canDownloadKaraoke`/`canDownloadCollection` (sin cambios en esa lógica).
5. Si falta el header o la verificación falla, la descarga se rechaza
   (`DEVICE_TOKEN_REQUIRED` / `DEVICE_TOKEN_INVALID`, ambos HTTP 401) — ya
   no existe un camino donde "no mandar nada" evada el límite.

**Límite honesto de este modelo**: como cualquier credencial guardada en el
navegador, el token en sí podría copiarse a otra máquina *si esa máquina
también tiene una sesión autenticada válida de la misma cuenta* (JWT de
sesión robado). Eso ya es un problema de "cuenta comprometida", no de
"adivinar/editar un string" — que es el ataque real que se cerró. No hay
atadura a hardware (eso requeriría WebAuthn/TPM, fuera de alcance de una
SPA). Ver `apps/api/src/auth/deviceToken.ts` para el detalle.

Tests: `apps/api/test/device-limit.test.ts` prueba explícitamente que un
`deviceId` puesto a mano en el body no tiene efecto, que un token
inventado se rechaza, y que un token emitido para otro usuario no sirve
bajo una sesión distinta.

## Motivos de rechazo (`DenyReason`)

| Código | Cuándo |
|---|---|
| `USER_NOT_FOUND` | El userId no existe |
| `USER_SUSPENDED` | `status = SUSPENDED` |
| `USER_EXPIRED` | `status = EXPIRED` o `subscriptionEnd` pasado |
| `COLLECTION_NOT_FOUND` | La colección no existe |
| `COLLECTION_INACTIVE` | `active = false` |
| `ACCESS_NOT_GRANTED` | No existe `UserCollectionAccess` |
| `ACCESS_DISABLED` | Existe pero `enabled = false` |
| `ACCESS_EXPIRED` | `expiresAt` pasado |
| `DEVICE_LIMIT_REACHED` | Dispositivo nuevo y cupo lleno |
| `KARAOKE_NOT_FOUND` | El karaokeId no existe |
| `ASSET_NOT_AVAILABLE` | Falta `masterAsset`/`previewAsset` |

Dos códigos más aparecen a nivel de ruta (no son parte de `DenyReason` del
dominio, son verificación de la credencial de dispositivo en sí):
`DEVICE_TOKEN_REQUIRED` (falta el header) y `DEVICE_TOKEN_INVALID` (firma
inválida, usuario no coincide, o el dispositivo fue desactivado). Y
`ARCHIVE_NOT_AVAILABLE` (a nivel de `BatchDownloadService`): se pidió
`PREBUILT_ARCHIVE` pero el ZIP no existe en storage — nunca se intenta
generar su URL.

Cada ruta HTTP traduce estos códigos a un status HTTP apropiado (403 para
casi todos, 404 para "no encontrado", 409 para límite de dispositivos) — ver
`apps/api/src/routes/downloads.routes.ts` (`reasonToStatus`).

## Cobertura de tests

- `packages/domain/src/AuthorizationService.test.ts` — 22 casos con un
  repositorio falso en memoria (sin base de datos).
- `apps/api/test/authorization.test.ts`,
  `apps/api/test/device-limit.test.ts`,
  `apps/api/test/admin-guard.test.ts` — los mismos escenarios pero
  ejercitados de punta a punta vía HTTP contra una base SQLite en memoria.
