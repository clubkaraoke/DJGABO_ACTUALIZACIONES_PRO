# Arquitectura — DJGABO ACTUALIZACIONES PRO

## Flujo obligatorio (punto 2 del brief)

```
Frontend (React)
   │  fetch /api/...  (con Authorization: Bearer <accessToken>)
   ▼
API (Fastify routes)
   │  nunca decide permisos por sí misma
   ▼
AuthorizationService (packages/domain)
   │  única fuente de verdad de: usuario activo, membresía vigente,
   │  colección activa, acceso otorgado, límite de dispositivos, asset disponible
   ▼
StorageService (apps/api/src/services/StorageService.ts)
   │  única clase que invoca al StorageProvider concreto
   ▼
StorageProvider  → MockStorageProvider | DropboxStorageProvider
```

El frontend **nunca** conoce una URL real de Dropbox ni un `storageKey`.
Todo lo que recibe es una URL temporal de vida corta (`TemporaryUrlDTO`).

## Por qué el dominio no conoce Prisma/Drizzle

`packages/domain` define un **puerto** (`AuthorizationRepositoryPort`) con
los métodos que `AuthorizationService` necesita (`getUser`, `getCollection`,
`getKaraoke`, `getAccess`, `countOtherActiveDevices`, `isDeviceKnown`).
`apps/api/src/db/drizzleAuthorizationRepository.ts` es la única clase que
implementa ese puerto contra la base de datos real.

Esto significa que:
- `AuthorizationService` se testea con un repositorio **falso en memoria**
  (`packages/domain/src/AuthorizationService.test.ts`), sin tocar ninguna base
  de datos.
- Cuando este proyecto tuvo que cambiar de Prisma a Drizzle a mitad de
  construcción (ver `docs/STORAGE.md`), **ni una sola línea de
  `packages/domain` cambió**.

El mismo patrón se repite para el indexador: `packages/storage` define
`IndexerRepositoryPort`, y `apps/api/src/db/drizzleIndexerRepository.ts` es
el único adaptador concreto.

## Capas

### `packages/shared`
Enums de negocio (`Role`, `UserStatus`, `AssetType`, `DownloadType`,
`BatchStrategy`) y los DTOs que viajan entre API y frontend. Sin lógica.

### `packages/domain`
- `AuthorizationService`: las 4 reglas del punto 7 del brief
  (`canAccessCollection`, `canPreviewKaraoke`, `canDownloadKaraoke`,
  `canDownloadCollection`). Puro TypeScript, sin dependencias de
  infraestructura.

### `packages/storage`
- `StorageProvider` (interfaz): `exists`, `getMetadata`,
  `getTemporaryDownloadUrl`, `getTemporaryPreviewUrl`, `listFolder`.
- `MockStorageProvider`: filesystem virtual en memoria, 100% funcional.
- `DropboxStorageProvider`: adaptador real contra la API v2 de Dropbox
  (OAuth refresh token, paginación por cursor, rate-limit 429 con retry,
  mapeo de errores). Implementado estructuralmente, sin credenciales.
- `createStorageProvider(env)`: única función que decide qué provider usar.
  Si `STORAGE_PROVIDER=dropbox` pero faltan credenciales, cae a Mock en vez
  de romper el arranque.
- `StorageIndexerService`: convierte el árbol de carpetas del
  `StorageProvider` activo en `Collection`/`Karaoke`/`Asset` en la base de
  datos, con modo `dryRun` que no escribe nada.

### `apps/api`
Fastify + Drizzle. Cada ruta HTTP:
1. Autentica (`fastify.authenticate` — verifica el JWT).
2. Si es admin, además exige rol (`fastify.requireRole("ADMIN")`).
3. Delega la decisión de negocio a `AuthorizationService` o a uno de los
   servicios de orquestación (`PreviewService`, `DownloadService`,
   `BatchDownloadService`).
4. Nunca construye una respuesta con datos que el `AuthorizationService` no
   haya aprobado.

Los servicios de orquestación (`apps/api/src/services/`) son los que unen
`AuthorizationService` + `StorageService` + registro de auditoría
(`DownloadLog`), siguiendo el diagrama del punto 2.

### `apps/web`
React + Vite + TanStack Query. Sin lógica de autorización: si el backend
devuelve 403, la UI simplemente muestra el estado bloqueado. El único guard
en el frontend (`RequireAdmin`) es una conveniencia de UX — la protección
real está en cada ruta `/api/admin/*` del backend (confirmado con tests: un
MEMBER recibe 403 real del servidor, no solo una redirección de React).

## Decisiones tomadas cuando el brief dejaba una opción abierta

- **`prisma/` → `apps/api/seed/`, DB en `apps/api/data/`**: al cambiar de
  Prisma a Drizzle ya no aplicaba la convención de carpeta `prisma/`.
- **Dispositivos se registran en la descarga, no en el login**: así el
  límite de dispositivos (punto 7) tiene un único punto de aplicación
  (`AuthorizationService.canDownloadKaraoke`/`canDownloadCollection`) en vez
  de duplicar la regla en el endpoint de login.
- **Octubre 2026 llega "pendiente de sincronizar" en el seed**, no ya
  sincronizado: así la pantalla de Sincronización (punto 24) tiene contenido
  real que detectar en vez de un botón que siempre dice "0 archivos nuevos".
