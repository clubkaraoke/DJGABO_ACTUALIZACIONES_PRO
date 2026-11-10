# DJGABO Actualizaciones PRO — migración Railway → Cloudflare (LAB)

**Estado:** fase 1 iniciada. **Nada de este directorio se despliega a producción.**
**Rama:** migration/cloudflare-sin-railway-20261109, basada en el backend realmente desplegado (commit d8e2869fc196f06e8cb77fe26474066f1f9114c4).
**No confundir con el Worker temporal djgabo-demo-lab**, utilizado para probar un único WAV desde Dropbox.

## Sistemas verificados antes de migrar

- Backend Railway: servicio djgabo-actualizaciones-webapi, Dockerfile apps/api/Dockerfile, rama staging; dominio djgabo-actualizaciones-webapi-production.up.railway.app.
- Frontend Railway: servicio djgabo-cp70-preview, Dockerfile apps/web/Dockerfile; rama migration/vip-base44-export-20261004, commit ce3cc9ba84fa1106fe99d0ecce85e7bb51db56a6; dominio www.gabokaraoke.com.
- Volumen persistente de backend: /data, capacidad provisionada 500 MB (no representa datos utilizados).
- SQLite con better-sqlite3/Drizzle y WAL.
- Dropbox como almacenamiento maestro. Webhook incremental, cursor y catálogo persistente.
- MP3 de demo: FFmpeg de Railway convierte en RAM; alternativa LAB probada Dropbox → Worker → PC/WebAssembly.
- Las descargas tienen ticket de un solo uso de 90 s, dispositivo autorizado y contabilidad de cuotas; ZIP se arma en streaming.

## PRIORIDAD 1 — respaldo consistente + validación (sin interrupción)

1. En Railway > djgabo-actualizaciones-webapi > volumen /data > Backups, **crear respaldo manual del volumen** desde el panel si la cuenta lo permite. Es protección ante fallos; *no sustituye* la exportación portátil de SQLite.
2. Confirmar la ruta real de DATABASE_URL sin divulgar su contenido; debe apuntar al volumen /data.
3. Crear snapshot ONLINE con la API backup() de SQLite, no copiar el .sqlite principal aislado del -wal.
   Script: scripts/backup-sqlite.cjs. Si se ejecuta en el contenedor actual, debe estar disponible allí; **la rama de GitHub no se encuentra automáticamente dentro del contenedor vivo**.
4. Descargar de manera privada el snapshot y los archivos persistentes del directorio catalog JSON y demás rutas del volumen mediante CLI de Railway (se requiere sesión autorizada). Ejemplo de descarga: railway volume files download /migration-backups/ARCHIVO.sqlite ./backups/ARCHIVO.sqlite. La sintaxis exacta de selección de servicio/volumen se verifica con railway volume --help.
5. Comprobar SHA-256, PRAGMA integrity_check, foreign_key_check y recuentos de todas las tablas.
6. Con snapshot local verificado: python scripts/prepare-d1.py ruta/al/snapshot.sqlite --out-dir /CARPETA_PRIVADA
   **NO** subir .sqlite, .sql, logs con clientes ni tokens a GitHub. El SQL exportado contiene TODOS los datos, incluidos contraseñas cifradas, usuarios y pagos.

### Por qué no copiar únicamente SQLite

En app.ts se persisten archivos JSON y branding en el directorio CATALOG_JSON_DIR:
- catálogos mensuales y versión;
- demo-player-settings.json y sus imágenes;
- download-settings.json;
- karaoke-requests.json;
- vip-migration-clients.json;
- assets de portadas, si aplica.

También existen tablas adicionales creadas por db/client.ts fuera del schema.ts (plan_marketing, manual_customer_accounts, manual_customer_payments, vip_allowed_phones, djgabo_feature_migrations). Preservar el **esquema completo real**, no reconstruir exclusivamente desde Drizzle.

## PRIORIDAD 2 — réplica D1 (nunca producción primero)

- Crear base de prueba D1 independiente (ej. djgabo-actualizaciones-migration-lab).
- Importar en ella el SQL privado tras validarlo (Cloudflare D1 no importa directamente un .sqlite).
- Comando documentado por Cloudflare: npx wrangler d1 execute NOMBRE_DB --remote --file=RUTA_PRIVADA.sql
- Comparar PRAGMA integrity_check, foreign_key_check, tablas, índices, recuentos, cuotas y reglas vigentes.
- Los timestamps se almacenan como enteros; revisar precisión y semántica de todas las columnas.
- No habilitar escrituras de clientes en D1 mientras Railway siga siendo origen autoritativo.
- La exportación inicial es una **foto en el tiempo**. Antes del cambio definitivo, sincronizar los cambios nuevos con un cierre controlado de escrituras o reconciliación verificable.

## PRIORIDAD 3 — reimplementar backend en Workers

| Módulo | Proyecto de migración |
|---|---|
| SQLite better-sqlite3 + Drizzle | D1 con consultas asíncronas, transacciones y pruebas de regresión |
| Autenticación y sesiones | Workers, D1, JWT/cookies con secretos nuevos y compatibilidad revisada |
| Catálogo y búsqueda | D1/R2, claves Dropbox opacas; ningún path master al navegador |
| Webhooks Dropbox | Workers + Queue, idempotencia, cursor y reintentos |
| Descargas individuales | Worker de streaming con ticket de 90 s, un uso, registro y no exposición de token |
| Descargas ZIP | Rediseñar para streaming dentro de límites de Workers; pruebas con archivos grandes |
| Demos MP3 | Recorte autorizado por Worker + WebAssembly LAME en cliente, sin WAV entero |
| Catálogos JSON, ajustes, portadas | R2 y D1; no depender de un FS persistente local |
| Correos y solicitudes | API externas con secretos de Workers |
| Frontend React/Vite | Static Assets/Pages con misma interfaz y rutas API compatibles |

**Seguridad**: el Worker de prueba actual no es backend productivo; contiene una clave compartida y un archivo fijo, y no debe exponerse como API general de catálogo. No permitir que el usuario envíe a Dropbox rutas arbitrarias.

## PRIORIDAD 4 — validaciones previas al cambio de DNS

- Login, renovación, bloqueo y 2 dispositivos por cuenta.
- Cuotas diarias, 3 carpetas/mes cuando corresponda, tickets únicos (90 s).
- Descarga de ZIP grande, cancelación y reversión de cuota tras fallo de red.
- Sincronización Dropbox de altas, bajas, renombres, corrección de WAV+CDG o MP3+CDG.
- Edición ADMIN, cambios de planes, pagos, branding, correos y solicitudes.
- Demos: audio 35–95 s, CDG a 35 s, rechazo de originales completos, PC y móvil.
- Prueba de concurrencia, límites, costos y seguridad.
- Solo entonces pasar dominio y webhooks de Railway a Cloudflare; mantener rollback.

## Dependencias operativas todavía pendientes

1. El conector Railway disponible **no permite ejecutar shell en el contenedor ni descargar contenido de volúmenes**. Puede ver servicio y metadatos. Se necesita Railway CLI autenticado en la PC, o una sesión autorizada en el panel de Railway, para extraer la copia real.
2. La PC consultada tiene Node y Python pero no mostró el ejecutable railway en PATH.
3. El entorno Cloudflare del usuario no está conectado a una herramienta de despliegue remoto; requerirá Wrangler autenticado o pasos asistidos por navegador.
4. Aún NO existe copia descargada del SQLite de producción, ni D1 creado ni sitio migrado.

## Fuentes técnicas

- https://docs.railway.com/volumes/backups
- https://docs.railway.com/volumes#manage-volume-files
- https://developers.cloudflare.com/d1/best-practices/import-export-data/
