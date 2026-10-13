# CHECKPOINT — Reconciliación Dropbox → DB → JSON + Google Sheets → Web VIP (2026-10-13)

## Problema real
En Septiembre 2026, Club Karaoke tenía 77 karaokes en panel, pero 61 pares WAV/CDG en Dropbox. Ejemplo Zaperoko Ámame ya retirado de la carpeta, aún visible.
StorageIndexerService solo generaba CREATE/UPDATE/SKIP/ERROR y no desactivaba karaokes desaparecidos.

## Copia anterior
Tag Git: checkpoint-before-dropbox-reconciliation-20261013.
Servicio API Railway djgabo-actualizaciones-webapi, SQLite volumen persistente /data.
NO borrar archivos de Dropbox ni registros históricos.

## Corrección
- Nuevo campo persistente karaoke.catalog_active (INTEGER DEFAULT 1).
- Indexador Dropbox completa lista de archivos y todas las subcarpetas, con paginación en DropboxStorageProvider.
- Solo después de terminar una corrida SIN errores, reconcilia identidades master reales por mes; los faltantes se marcan catalog_active=0, sin eliminación física.
- Dry-run y errores de Dropbox no hacen retiros; mover el mismo providerFileId a otra colección mantiene la identidad; reingresar reactivará el mismo registro.
- Consultas de carpetas, contadores, búsqueda, catálogo JSON mensual, descargas y previews filtran los retirados.
- Dropbox webhook incremental: meses afectados → indexador reconciliador → JSON mensual → snapshot hacia SheetMirrorService → cursor.
- Admin Sincronización dispone de «Reconciliar mes», sin rutas arbitrarias y solo ADMIN: /api/admin/sync/reconcile-month. Ambos modos: analizar y ejecutar.
- Admin sincronización manual /sync/run publica JSON y mirroring de hojas para meses escaneados.
- One-time background startup: reconcilia específicamente Septiembre 2026 con marca de migración persistente, deja éxito en logs y no se repite tras completarse. Valida Dropbox, JSON y mirroring antes de sellar marcador.
- Mantener Octubre En preparación, sin tocar permisos VIP, históricos, CDG, planes, ni descargas de carpetas completas.

## Pruebas
- test/dropbox-reconciliation.test.ts: inicial, borrado/movido, dry-run, fallo Dropbox, reactivación con ID.
- Regresión: VIP viejo, registro manual y seguridad.
- Verificar tras despliegue: Railway SUCCESS, API /health, /api/catalog/2026/09/index.json, /api/public/collections y título Zaperoko, Sheet maestro, panel Admin.
- No declarar Sheet actualizada si no se verifica respuesta e historial.
