# Notas de despliegue — DJGABO ACTUALIZACIONES PRO

**Este documento es únicamente una guía. No se desplegó nada en producción
ni se modificó ningún otro proyecto de DJGABO/KIT KARAOKE.**

## Antes de desplegar

1. Generar secretos JWT propios (no uses los de `.env.example`):
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. Decidir si te quedas en SQLite (suficiente para un catálogo de este
   tamaño, ~100-1000 karaokes) o migras a Postgres (`docs/STORAGE.md`) si
   esperas mucho más volumen o necesitas alta disponibilidad.
3. Conectar Dropbox de verdad (`docs/DROPBOX_SETUP.md`) — hasta ahora todo
   corrió sobre `MockStorageProvider`.
4. Configurar `CORS_ORIGIN` con el dominio real del frontend (no
   `localhost`).
5. Poner el archivo SQLite (o la base Postgres) en almacenamiento
   persistente con backups — actualmente vive en `apps/api/data/dev.db`,
   que está en `.gitignore` a propósito.

## Camino sugerido (no probado end-to-end)

- **API**: cualquier VPS/contenedor con Node 22, o el `Dockerfile` de
  `apps/api/`. Necesita un volumen persistente para `apps/api/data/` si te
  quedas en SQLite.
- **Web**: build estático (`npm run build --workspace=apps/web` → carpeta
  `apps/web/dist`) servible desde cualquier CDN/static hosting, o el
  `Dockerfile` de `apps/web/`.
- **Reverse proxy**: en producción probablemente quieras Nginx/Caddy
  delante de ambos, sirviendo el frontend estático y proxeando `/api` al
  contenedor del API (igual que hace Vite en desarrollo).

## Checkpoint final (punto 36)

### Arquitectura utilizada
Ver `docs/ARCHITECTURE.md`. Resumen: monorepo npm workspaces,
`packages/domain` y `packages/storage` desacoplados de infraestructura vía
puertos, `apps/api` (Fastify + Drizzle) implementa esos puertos, `apps/web`
(React + Vite) consume la API sin lógica de autorización propia.

### Árbol de carpetas (real, tras la construcción)
```
DJGABO_ACTUALIZACIONES_PRO/
├── apps/
│   ├── web/    (React + Vite + Tailwind)
│   └── api/    (Fastify + Drizzle + better-sqlite3)
├── packages/
│   ├── shared/   (enums + DTOs)
│   ├── domain/   (AuthorizationService)
│   └── storage/  (StorageProvider, indexador)
├── docs/
├── docker-compose.yml
├── .env.example
└── README.md
```

### Pantallas creadas
Login · Home ("Mis actualizaciones") · Detalle de colección (grid/lista +
búsqueda) · Modal de preview · Modal de descarga completa con progreso ·
Admin: Dashboard, Clientes, Detalle de cliente, Planes, Colecciones,
Karaokes, Descargas, Sincronización.

### Endpoints creados
- `POST /api/auth/login|refresh|logout`, `GET /api/auth/me`
- `GET /api/collections`, `GET /api/collections/:id`, `GET /api/collections/:id/archive-status`
- `GET /api/karaokes/search`
- `POST /api/preview/karaoke/:id`
- `POST /api/downloads/karaoke/:id`, `POST /api/downloads/collection/:id`
- `POST /api/devices/register`
- `GET/PATCH/POST /api/admin/clients[...]`, `POST /api/admin/clients/:userId/devices/:sessionId/deactivate`
- `GET/POST/PATCH /api/admin/plans[...]`
- `GET/POST/PATCH /api/admin/collections[...]`
- `GET/PATCH /api/admin/karaokes[...]`
- `GET /api/admin/downloads`, `GET /api/admin/dashboard`
- `GET /api/admin/sync/status`, `POST /api/admin/sync/analyze|run`

### Modelos de base de datos
`Plan`, `User`, `RefreshToken`, `Collection`, `Karaoke`, `Asset`,
`UserCollectionAccess`, `DownloadLog`, `DeviceSession`, `SyncRun` — ver
`apps/api/src/db/schema.ts`.

### Sistema de permisos
`AuthorizationService` (ver `docs/AUTHORIZATION.md`), aplicado en el
backend en cada ruta relevante. Confirmado con tests que un `MEMBER` recibe
403 real del servidor al pedir cualquier ruta `/api/admin/*`, no solo un
redirect de React.

### Storage providers
`MockStorageProvider` (100% funcional), `DropboxStorageProvider`
(implementado estructuralmente, sin credenciales, no probado contra la API
real — ver limitaciones). Selección automática vía `createStorageProvider`.

### Estado del adaptador Dropbox
Código completo (OAuth refresh token, paginación, rate-limit, mapeo de
errores) siguiendo la documentación pública de la API v2. **No ejercitado
contra Dropbox real** por falta de acceso de red en el entorno de
construcción.

### Sincronizador
`StorageIndexerService`, con modo `dryRun`. Probado de punta a punta: el
seed deja 6 archivos "pendientes" en Octubre 2026 que `/admin/sincronizacion`
detecta y sincroniza de verdad (crea la colección + 6 karaokes), sin
duplicar si se corre dos veces.

### Tests realizados
163 tests, todos pasando:
- `packages/domain`: 26 (reglas de autorización + registro de dispositivo, con repositorio falso)
- `packages/storage`: 65 (Mock provider + indexador + convención de previews
  + identidad interna robusta por `identityKey` (incluye el `provider`,
  nunca colisiona entre Dropbox/Mock/futuros providers) + eficiencia de
  red (cero `getMetadata` por archivo, previews resueltos por listado) +
  aislamiento entre providers (mismo storageKey/providerFileId en
  providers distintos coexisten; rename/move sigue actualizando el mismo
  Asset) + mapper de MIME types centralizado + DropboxStorageProvider con
  `fetchImpl` mockeado, incluyendo la clasificación correcta de 409)
- `apps/api`: 67 (login en sus 4 variantes, refresh/logout, acceso a
  colecciones permitidas/bloqueadas/inactivas, preview y descarga
  autorizados/rechazados, seguridad de dispositivos server-issued
  (incluyendo desvinculación desde admin), guard de ADMIN en las 7 rutas
  admin, sincronización dry-run vs. real, contrato de descarga —extensión
  real preservada y tamaño real del ZIP—, fail-fast de Dropbox en
  producción, y constraints UNIQUE(provider, providerFileId) y
  UNIQUE(provider, storageKey) en assets, incluyendo el caso crítico de
  coexistencia Mock/Dropbox contra SQLite real)
- `apps/web`: 5 (guards de ruta — un MEMBER nunca ve `/admin` —, LoginPage)

### Resultado exacto de lint
```
$ npx eslint apps/api/src apps/api/test apps/web/src
(sin salida — 0 errores, 0 warnings)
```

### Resultado exacto de typecheck
```
$ npm run typecheck --workspace=packages/shared   → OK
$ npm run typecheck --workspace=packages/domain   → OK
$ npm run typecheck --workspace=packages/storage  → OK
$ npm run typecheck --workspace=apps/api          → OK
$ npm run typecheck --workspace=apps/web          → OK
```

### Resultado exacto de tests
```
packages/domain   ✓ 26 tests passed
packages/storage  ✓ 65 tests passed
apps/api          ✓ 67 tests passed
apps/web          ✓ 5 tests passed
TOTAL: 163/163 passed
```

### Resultado exacto de build
```
$ npm run build --workspace=packages/shared   → OK
$ npm run build --workspace=packages/domain   → OK
$ npm run build --workspace=packages/storage  → OK
$ npm run build --workspace=apps/api          → OK (tsc, sin errores)
$ npm run build --workspace=apps/web          → OK
  dist/index.html                   0.51 kB
  dist/assets/index-*.css          17.69 kB │ gzip:  4.38 kB
  dist/assets/index-*.js          258.88 kB │ gzip: 77.00 kB
```

### Credenciales demo
Ver tabla en `README.md`.

### Limitaciones pendientes (honestas)

1. **Prisma → Drizzle**: el brief pedía Prisma; se documentó y justificó el
   cambio (`binaries.prisma.sh` bloqueado en el sandbox). La migración a
   Postgres desde Drizzle es sencilla pero no es "cambiar una línea" como
   hubiera sido con Prisma — ver `docs/STORAGE.md`.
2. **Docker no probado**: los `Dockerfile` y `docker-compose.yml` son
   correctos en su estructura (multi-stage, monorepo-aware) pero no se
   pudieron ejecutar en el sandbox (sin daemon de Docker). Pruébalos antes
   de confiar en ellos para producción.
3. **DropboxStorageProvider no ejercitado contra Dropbox real** (sin acceso
   de red al dominio de Dropbox en el sandbox), aunque sí tiene 13 tests
   unitarios con `fetchImpl` mockeado cubriendo OAuth refresh, 401, 429,
   paginación y mapeo de errores.
4. **CRUD admin parcial**: colecciones y planes tienen creación/edición
   básica; no se implementó edición de portada con upload de imagen (se usa
   `coverUrl` como texto) ni borrado de ninguna entidad (a propósito, dado
   el punto 28 "nunca ejecutar sincronización destructiva" aplicado también
   al panel admin).
5. **Descarga múltiple real es secuencial, no paralela**: `batchDownloader.ts`
   descarga un archivo a la vez (con progreso real por bytes vía
   `ReadableStream`) en vez de varios en simultáneo. Es una simplificación
   deliberada para V1 — más predecible, a costa de no aprovechar todo el
   ancho de banda. Paralelizar con un límite de concurrencia (ej. 3) es la
   mejora natural de V2.
6. **Descarga múltiple real acumula el archivo en memoria** antes de
   guardarlo (vía `Blob`), porque la File System Access API (streaming a
   disco directo) no tiene soporte universal en navegadores. Para archivos
   de karaoke típicos (30-80 MB) esto es aceptable; para colecciones con
   archivos mucho más grandes convendría revisarlo.
7. ~~Device token sin UI de revocación~~ — **resuelto en esta pasada**:
   `/admin/clientes/:id` ahora muestra los dispositivos activos con botón
   "Desvincular", que desactiva el `DeviceSession` y hace que ese
   `X-Device-Token` deje de servir de inmediato (probado en
   `device-deactivation.test.ts`).
8. **Rate limiting**: implementado con `@fastify/rate-limit` en login (8/min),
   registro de dispositivo (10/min) y descargas (60/min individuales,
   20/min colección) — básico pero funcional, no ajustado a carga de
   producción real.
9. **Postgres en `docker-compose.yml` no está conectado a la app** (a
   propósito, punto 5 de esta pasada): sigue siendo un contenedor de
   referencia para una futura migración, la API corre 100% sobre SQLite.
   Documentado explícitamente en `docker-compose.yml`, `README.md` y
   `docs/STORAGE.md` para que nadie asuma que ya está en uso.
10. **Identidad interna robusta** (punto 1) solo usa `providerFileId`/SHA-256
    hacia adelante: los `Asset` ya sincronizados sin ese campo (como todo el
    seed de demo, que corre sobre `MockStorageProvider` sin IDs simulados)
    se identifican por el fallback SHA-256 del `storageKey` hasta que una
    futura sincronización con Dropbox real les asigne su id. Esto es
    exactamente el comportamiento de fallback documentado, no un caso sin
    cubrir. **Corrección respecto de la pasada anterior**: se detectó que
    el `providerFileId` original se estaba comprimiendo en un hash de 32
    bits para usarlo como identidad — se corrigió para usarlo tal cual
    (sin hashear) o, en su defecto, derivar con SHA-256/128 bits. Ver
    `docs/STORAGE.md`.
11. **Eficiencia de red del indexador**: antes se llamaba `getMetadata` una
    vez por master y otra por preview (hasta 60,000 requests para 30,000
    archivos). Ahora toda la metadata sale de `listFolder` y los previews
    se resuelven listando `_PREVIEWS` una vez por mes — 0 llamadas a
    `getMetadata` durante la sincronización, verificado con espías en los
    tests. No probado contra el límite real de rate-limit de Dropbox (sigue
    sin haber acceso de red al dominio de Dropbox en este entorno).
12. **Aislamiento entre providers — corrección real encontrada**: la pasada
    anterior ya tenía `UNIQUE(provider, providerFileId)`, pero las
    búsquedas de identidad (`findAssetByProviderFileId`,
    `findAssetByStorageKey`, y el `upsertAsset` interno) seguían sin acotar
    por `provider`, y `storageKey` era único de forma global. Esto habría
    provocado un conflicto real de constraint al conectar Dropbox si algún
    path coincidiera con uno ya sembrado por `MockStorageProvider`. Se
    corrigió en las tres capas (búsquedas scoped, `UNIQUE(provider,
    storageKey)`, `identityKey` con el provider incluido) y se verificó
    contra SQLite real el caso exacto: un Asset Mock y uno de Dropbox con
    el mismo `storageKey` coexisten sin error. Ver `docs/STORAGE.md` →
    "Aislamiento entre providers".

### Pasos exactos para conectar Dropbox
Ver `docs/DROPBOX_SETUP.md`. Resumen: crear app en Dropbox → obtener
`APP_KEY`/`APP_SECRET`/`REFRESH_TOKEN` → ponerlos en `apps/api/.env` →
`STORAGE_PROVIDER=dropbox` → reiniciar API → sincronizar desde
`/admin/sincronizacion`.
