# Storage — DJGABO ACTUALIZACIONES PRO

## Interfaz `StorageProvider`

```ts
interface StorageProvider {
  readonly kind: "mock" | "dropbox";
  exists(key: string): Promise<boolean>;
  getMetadata(key: string): Promise<StorageMetadata>;
  getTemporaryDownloadUrl(key: string, options?: TemporaryUrlOptions): Promise<string>;
  getTemporaryPreviewUrl(key: string, options?: TemporaryUrlOptions): Promise<string>;
  listFolder(path: string): Promise<StorageEntry[]>;
}
```

Definida en `packages/storage/src/StorageProvider.ts`. Toda `storageKey` se
valida con `assertSafeStorageKey` antes de usarse (bloquea `..` y claves que
no empiezan con `/`, para evitar path traversal — punto 28).

## `MockStorageProvider`

Filesystem virtual en memoria. Genera URLs firmadas falsas
(`mock://storage/download?key=...&token=...`) con expiración real (el token
incluye un timestamp de expiración). Completamente funcional: así es como
corre todo el flujo de este proyecto hoy.

## `DropboxStorageProvider`

Implementado contra la API v2 de Dropbox real:
- OAuth2 con refresh token (`/oauth2/token`) — el access token se renueva en
  memoria y se reintenta una vez automáticamente en un 401.
- `listFolder` pagina con cursor (`/files/list_folder/continue`).
- Rate limit (429): respeta `Retry-After` y reintenta hasta 2 veces antes de
  lanzar `StorageError("RATE_LIMITED")`.
- Errores de Dropbox se mapean a `StorageError` con una razón tipada
  (`NOT_FOUND`, `AUTH_ERROR`, `RATE_LIMITED`, `CONFLICT`, `UNKNOWN`). Un 409
  de Dropbox NO se convierte automáticamente en `NOT_FOUND`: solo se
  clasifica así cuando el error es realmente del árbol `path/not_found`
  (por `error_summary` y, como respaldo, por la estructura tageada de
  Dropbox); cualquier otro 409 (`path/not_file`, `path/not_folder`,
  `too_many_write_operations`, etc.) se propaga como `CONFLICT` — nunca se
  disfraza de "no encontrado".

No tiene credenciales reales y no fue probado contra la API real de Dropbox
(el sandbox donde se construyó no tiene acceso de red a `api.dropboxapi.com`).
Ver `docs/DROPBOX_SETUP.md` para conectarlo.

## Selección automática (`createStorageProvider`)

```
STORAGE_PROVIDER=mock (o no seteado)     → MockStorageProvider
STORAGE_PROVIDER=dropbox + credenciales  → DropboxStorageProvider
STORAGE_PROVIDER=dropbox sin credenciales → MockStorageProvider (fallback)
```

`createStorageProvider` (en `packages/storage`) es agnóstico del entorno:
siempre cae a Mock si faltan credenciales, sin importar `NODE_ENV`. La
política de **fail-fast en producción** (punto 2) vive un nivel arriba, en
`apps/api/src/storage/storageInstance.ts` → `getStorageProvider(env)`, que sí
conoce `NODE_ENV`:

```
STORAGE_PROVIDER=dropbox sin credenciales + NODE_ENV=production   → el servidor NO arranca (throw)
STORAGE_PROVIDER=dropbox sin credenciales + NODE_ENV=development  → cae a Mock, con un console.warn
STORAGE_PROVIDER=dropbox sin credenciales + NODE_ENV=test         → cae a Mock (igual que development)
STORAGE_PROVIDER=mock explícito, cualquier NODE_ENV                → nunca falla (no se pidió Dropbox)
```

Nunca se sirve contenido simulado en producción a espaldas del operador:
si configuraste `STORAGE_PROVIDER=dropbox` en un entorno de producción y
falta una credencial, es un error de configuración que debe bloquear el
arranque, no un fallback silencioso. Ver
`apps/api/test/storage-provider-failfast.test.ts`.

## `StorageIndexerService`

Recorre `{root}/{año}/{MM MES}/*.mp4` (usando el `StorageProvider` activo,
sin importar cuál sea) y:
1. Parsea `"ARTISTA - TITULO.mp4"` en artista/título
   (`packages/storage/src/indexer/filenameParser.ts`).
2. Deriva un `code` estable con un hash de la identidad del archivo — el
   `providerFileId` si el provider lo da, o el `storageKey` como fallback
   (`deriveCodeFromKey`, ver la sección "Identidad estable" más abajo) —
   así correr la sincronización dos veces nunca duplica un karaoke, ni
   tampoco lo hace un rename/move cuando hay id estable.
3. Resuelve el MIME type de cada archivo (master y preview) con el mapper
   centralizado `packages/storage/src/mimeTypes.ts` (punto 4) — nunca lo
   arma a mano con un ternario.
4. Con `dryRun: true`, solo reporta qué haría (`CREATE`/`UPDATE`/`SKIP`) sin
   escribir en la base de datos.
5. Con `dryRun: false`, crea/actualiza `Collection`, `Asset` y `Karaoke`, y
   registra la corrida en `SyncRun`.

Nunca borra nada (no hay sincronización destructiva, punto 10).

## Identidad interna robusta (punto 1 — corrección importante sobre la V4)

**Problema que esto resuelve, en dos capas**:

1. (V4) El `code` de un karaoke se derivaba de un hash de su `storageKey`.
   Si alguien renombraba o movía un archivo en Dropbox, el `storageKey`
   cambiaba, el hash cambiaba, y el indexador lo trataba como un archivo
   nuevo — creando un `Asset`/`Karaoke` duplicado.
2. (V4 lo arregló a medias) La V4 introdujo `providerFileId`, pero seguía
   comprimiéndolo en un **hash de 32 bits** para usarlo como `code`/identidad
   — y ese hash de 32 bits es exactamente la misma clase de problema, ahora
   aplicado también al providerFileId: con catálogos de decenas de miles de
   archivos, la probabilidad de colisión de un hash de 32 bits (~4.3 mil
   millones de valores posibles) deja de ser despreciable.

**Solución definitiva**: se separó por completo el CÓDIGO VISUAL
(`Karaoke.code`, corto, para mostrar en la UI, ya no único a nivel de base
de datos, nunca usado para identidad) de la IDENTIDAD INTERNA
(`Karaoke.identityKey`, ver `packages/storage/src/indexer/identity.ts` →
`deriveIdentityKey`):

- Si el provider da un `providerFileId` (Dropbox lo da, estable entre
  renames/moves), se usa **tal cual**, sin hashear — ya es único por
  diseño del provider; hashearlo solo puede sumar riesgo de colisión,
  nunca reducirlo.
- Si no (Mock por defecto), se deriva con **SHA-256 del storageKey,
  truncado a 128 bits** (32 caracteres hex) — muy por encima del mínimo de
  96/128 bits pedido, y astronómicamente más seguro que un hash de 32 bits
  para el mismo propósito.
- Prefijos (`pid:`/`sk:`) dejan explícito el origen y garantizan que un
  providerFileId real nunca colisione con un hash de fallback.

`StorageIndexerService` usa `identityKey` (nunca `code`) para decidir si un
`Asset`/`Karaoke` ya existe: `findAssetByProviderFileId` /
`findAssetByStorageKey` para el asset, `findKaraokeByIdentityKey` para el
karaoke — sin acotar a colección, porque un archivo con identidad estable
pudo haberse movido de mes.

**Constraints de base de datos (punto 2)**: `UNIQUE(provider,
providerFileId)` en `assets` y `UNIQUE(identityKey)` en `karaokes`. SQLite
(como el estándar SQL) nunca considera dos `NULL` iguales para efectos de
`UNIQUE`, así que esto permite tantas filas con `providerFileId = NULL`
como haga falta (providers sin id estable) sin chocar entre sí, pero
impide que el mismo id de un mismo provider quede asociado a dos `Asset`
distintos. Ver `apps/api/test/db-constraints.test.ts`.

Efecto práctico de un rename/move cuando hay `providerFileId`:
- El `Asset` existente se actualiza (nuevo `storageKey`, `fileName`,
  `size`) — no se crea uno nuevo.
- El `Karaoke` existente se actualiza (incluyendo `collectionId`, por si
  el archivo se movió a otro mes) — tampoco se duplica.
- Si el mes de destino todavía no tiene `Collection`, el `Analizar`
  (dry-run) lo reporta como `UPDATE`, nunca `CREATE`, y **no crea la
  colección** — eso solo ocurre al sincronizar de verdad (punto 4).

Ver `packages/storage/src/indexer/identity.test.ts` y
`packages/storage/src/indexer/StorageIndexerService.test.ts` (describe
"identidad estable por providerFileId") para los casos probados: rename
simple, rename detectado en dry-run, move entre meses (colección ya
existente), move hacia una colección que todavía no existe, y el fallback
sin id estable.

## Eficiencia de red para catálogos grandes (punto 3)

`StorageIndexerService` **nunca** llama a `getMetadata` por archivo. Antes
(V4) sí lo hacía — una vez por cada master y, si existía, una vez más por
cada preview — lo que para un catálogo de 30,000 archivos significaba
30,000-60,000 requests a Dropbox solo para sincronizar.

Ahora toda la metadata que hace falta (tamaño, fecha, `providerFileId`)
sale directamente de `StorageEntry`, que `listFolder` ya trae de una sola
vez por carpeta:

- `StorageEntry.providerFileId` — Dropbox lo incluye en la respuesta de
  `/files/list_folder` (campo `id` por entrada); `DropboxStorageProvider`
  lo mapea ahí mismo, sin ningún request adicional.
- **Previews**: en vez de pedir `getMetadata(_PREVIEWS/archivo.mp4)` por
  cada karaoke, `run()` lista la subcarpeta `_PREVIEWS` **una sola vez por
  mes** y arma un `Map<nombreDeArchivo, StorageEntry>`; cada archivo del
  mes busca su preview en ese mapa (O(1), sin red).

Con esto, sincronizar un mes con N karaokes hace un número de requests
proporcional a la cantidad de **carpetas** (año, mes, `_PREVIEWS`), no a la
cantidad de **archivos**. Ver el describe "eficiencia de red (punto 3)" en
`StorageIndexerService.test.ts`, que verifica con espías (`vi.spyOn`) que
`getMetadata` no se llama ni una sola vez al sincronizar un catálogo de
prueba, y que `listFolder` se llama un número acotado de veces
indebendientemente de cuántos karaokes tenga el mes.

## Aislamiento entre providers (corrección de esta pasada)

**Problema real encontrado**: `UNIQUE(provider, providerFileId)` ya protegía
la identidad externa, pero `findAssetByProviderFileId()` y `upsertAsset()`
seguían buscando solo por `providerFileId`, sin acotar por `provider`. Y
`assets.storageKey` era único de forma **global**. Esto significaba que,
al pasar de `MockStorageProvider` a Dropbox real, un archivo Mock y un
archivo Dropbox que coincidieran en el mismo path (`storageKey`) chocarían
por el constraint — dos archivos de dos providers completamente distintos
compitiendo por la misma fila.

**Corrección, en tres capas:**

1. **Búsquedas scoped por provider**: `findAssetByProviderFileId(provider,
   providerFileId)` y `findAssetByStorageKey(provider, storageKey)` — el
   puerto (`IndexerRepositoryPort`) ahora exige el `provider` como primer
   argumento en ambas. `DrizzleIndexerRepository.upsertAsset()` usa su
   propio `storageProviderKind` (ya lo recibía en el constructor) para
   scopear su búsqueda interna de existencia — nunca busca "en todos los
   providers a la vez".
2. **`UNIQUE(provider, storageKey)`** en vez de `UNIQUE(storageKey)`: dos
   providers distintos pueden tener un Asset en el mismo path sin chocar
   (son archivos distintos); un mismo provider nunca puede tener dos filas
   con el mismo path.
3. **`identityKey` incluye el provider**: `pid:<provider>:<providerFileId>`
   y, en fallback, `sk:<provider>:<SHA-256/128 bits del storageKey>` — ver
   `packages/storage/src/indexer/identity.ts`. Sin esto, el mismo
   `providerFileId` (coincidencia posible entre providers con esquemas de
   ID parecidos) o el mismo `storageKey` de fallback producirían la misma
   identidad interna para dos archivos que no tienen nada que ver.

**Efecto secundario corregido de paso**: `bootstrapMockStorageFromDb` (en
`apps/api/src/storage/storageInstance.ts`) hidrataba el filesystem virtual
de Mock con **todos** los Assets de la base de datos, sin filtrar por
provider. Ahora solo toma los que tienen `provider = 'mock'` — de lo
contrario, un Asset de Dropbox con el mismo `storageKey` que uno de Mock
pisaría su entrada en el mapa en memoria.

Ver `apps/api/test/db-constraints.test.ts` (describe "UNIQUE(provider,
storageKey)") para el caso crítico probado contra SQLite real: un Asset
Mock ya existente y una sincronización de Dropbox con el mismo storageKey
coexisten como dos filas independientes, sin error de constraint. Y
`packages/storage/src/indexer/StorageIndexerService.test.ts` (describe
"aislamiento entre providers") para el mismo caso a nivel de indexador,
incluyendo que una segunda sincronización de Dropbox solo actualiza el
Asset de Dropbox, nunca el de Mock.

## Convención de previews

El indexador **nunca** usa el master completo como preview. Para que un
karaoke tenga preview, sube un archivo corto (recomendado: 30-60s) con el
**mismo nombre** que el master, en una subcarpeta `_PREVIEWS` del mismo mes:

```
/ACTUALIZACIONES/2026/09 SEPTIEMBRE/GRUPO 5 - MOTOR Y MOTIVO.mp4                (master)
/ACTUALIZACIONES/2026/09 SEPTIEMBRE/_PREVIEWS/GRUPO 5 - MOTOR Y MOTIVO.mp4      (preview)
```

Ver `packages/storage/src/indexer/previewConvention.ts`. Si el archivo de
preview no existe, el karaoke simplemente queda sin preview (el botón "▶
Preview" aparece deshabilitado) — no se genera nada automáticamente a
partir del master. Un preview ya asociado nunca se borra porque una corrida
posterior no lo vuelva a encontrar (ver tests en
`StorageIndexerService.test.ts`).

## Disponibilidad del ZIP mensual (PREBUILT_ARCHIVE)

`BatchDownloadService` nunca asume que `/ARCHIVES/{slug}.zip` existe.
`StorageService.getArchiveStatus(collectionSlug)` verifica su existencia
real contra el `StorageProvider` activo ANTES de generar cualquier URL:

- Si no existe, una descarga con `strategy: "PREBUILT_ARCHIVE"` se rechaza
  con `ARCHIVE_NOT_AVAILABLE` (404) — nunca se intenta la descarga.
- El cliente puede consultar `GET /api/collections/:id/archive-status` para
  saber de antemano si ofrecer la opción de ZIP único (el frontend por
  defecto usa `MULTI_FILE`, que siempre funciona).
- El panel admin (`/admin/colecciones`) muestra un badge "ZIP disponible" o
  "Sin ZIP — solo individual" por colección, calculado con el mismo método.
- En el seed de datos, las colecciones sembradas manualmente sí tienen un
  ZIP sintético; una colección recién creada por `StorageIndexerService`
  (como Octubre 2026 al sincronizar) NO lo tiene — así queda demostrado el
  camino real de "no disponible" sin tener que forzarlo artificialmente.



El brief pedía Prisma. Al ejecutar `prisma generate`, Prisma intenta
descargar su motor binario desde `binaries.prisma.sh`; ese dominio devolvió
403 en el entorno donde se construyó este proyecto (no está en la lista de
dominios permitidos del sandbox). Se decidió pivotar a **Drizzle ORM +
better-sqlite3** en vez de entregar código sin poder verificarlo — ver
`docs/DEPLOYMENT_NOTES.md` para el detalle completo de esa decisión.

## Semántica del TTL de las URLs temporales

`getDownloadUrl`/`getPreviewUrl` en `StorageService` devuelven
`expiresAt: Date | null`, nunca un número inventado:

- **MockStorageProvider**: `expiresAt` es real y preciso, porque es el
  propio Mock quien fija ese TTL exacto al firmar el token que genera.
- **DropboxStorageProvider**: `expiresAt` es siempre `null`.
  `/files/get_temporary_link` no acepta un TTL configurable desde quien lo
  llama ni informa uno en su respuesta — Dropbox documenta que sus links
  duran ~4 horas, pero esa cifra no es algo que la app controle ni pueda
  verificar con exactitud caso por caso. Devolver aquí "10 minutos" o "1
  hora" (como se hacía antes) sería mostrarle al cliente una fecha
  fabricada. El frontend trata `expiresAt: null` como "el proveedor no
  informa una expiración exacta" en vez de asumir un valor.

### Estrategia futura para previews con TTL corto real (no implementada)

Si en algún momento se necesita que el preview expire de verdad en, por
ejemplo, 60 segundos (Dropbox no permite eso), la única forma real es dejar
de exponer el link de Dropbox directamente y **proxear el contenido a
través de nuestro propio backend**:

1. `PreviewService` emitiría un token firmado de corta vida propio (igual
   patrón que `deviceToken.ts`), no el link de Dropbox.
2. Un endpoint nuevo, p. ej. `GET /api/preview-stream/:token`, verificaría
   ese token y recién ahí pediría el archivo a Dropbox (`getMetadata` +
   descarga interna) para transmitirlo (stream) al cliente.
3. Como el TTL corto ahora lo hace cumplir nuestro propio servidor (el
   link real de Dropbox nunca se expone), sí sería un TTL real y
   verificable — a costa de que el ancho de banda del preview pase por
   nuestro servidor en vez de ir directo a Dropbox.

No se implementó porque no hay una necesidad de negocio activa (el preview
de 30-60s del punto 16 ya cumple su propósito con el link directo), pero
queda documentado como el camino correcto si se vuelve necesario.

## Migrar de SQLite a Postgres

> **Estado actual (V1): esto NO está hecho.** La app corre 100% sobre
> SQLite (`apps/api/data/dev.db`, better-sqlite3 + Drizzle). El servicio
> `postgres` que aparece en `docker-compose.yml` (perfil `postgres`, apagado
> por defecto) es solo un contenedor de referencia para el día que se haga
> esta migración — **no está conectado a la API de ninguna forma**, no
> recibe queries, no tiene el schema aplicado, y prenderlo con
> `docker compose --profile postgres up` no cambia en nada qué base usa la
> app. La sección de abajo es una guía para cuando esa migración se decida
> hacer, no un reflejo de lo que ya existe.

Con Drizzle, la migración no es "cero cambios" como hubiera sido con Prisma,
pero sí acotada a `apps/api/src/db/`:

1. Instalar el driver: `npm install pg --workspace=apps/api` (o `postgres`).
2. En `apps/api/src/db/schema.ts`, cambiar los imports de
   `"drizzle-orm/sqlite-core"` a `"drizzle-orm/pg-core"` y los tipos de
   columna equivalentes (`text`/`integer` de sqlite-core tienen sus
   contrapartes en pg-core; los `mode: "timestamp"` y `mode: "boolean"` se
   vuelven tipos nativos de Postgres, lo cual es una simplificación).
3. En `apps/api/src/db/client.ts`, reemplazar `better-sqlite3` +
   `drizzle-orm/better-sqlite3` por `pg` + `drizzle-orm/node-postgres`.
4. Cambiar `DATABASE_URL` a una cadena de conexión Postgres.
5. Regenerar migraciones: `npx drizzle-kit generate` y aplicarlas.

**Ninguno** de estos cambios toca `packages/domain`, `packages/storage`, ni
las rutas de la API — todas dependen de los puertos (`AuthorizationRepositoryPort`,
`IndexerRepositoryPort`), no de Drizzle ni de SQLite directamente.
