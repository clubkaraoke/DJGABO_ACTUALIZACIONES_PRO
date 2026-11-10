# Estado de la migración — 2026-11-09 (Perú) / 2026-11-10 UTC

**Rama aislada:** migration/cloudflare-sin-railway-20261109. No fusionada ni desplegada.

## Completado y verificado

- Railway CLI autorizado en la PC, acceso a servicio real por SSH.
- Identificado volumen de datos /data: 500 MB aprovisionados, 92.60 MB utilizados al iniciar.
- Identificado SQLite en modo WAL; respaldo consistente creado usando better-sqlite3.backup() en vivo.
- Resultado del respaldo: integrity_check=ok, foreign_key_check=0, 20 tablas.
- Copia SQLite descargada al equipo del usuario, SHA-256 local idéntico al archivo de Railway.
- Carpeta de catálogo y configuraciones respaldada en tar.gz (~2.1 MB), archivo descargado y verificación tar exitosa.
- SQL de D1 generado **en carpeta privada del equipo, no en GitHub**.
- Primera exportación reveló orden de inserciones incompatible con FK; corregida.
- Exportación corregida restaurada en SQLite temporal: 20 tablas, 41 648 filas en total, integrity_check=ok, FK=0.
- Scripts públicos (sin secretos) versionados: backup-sqlite.cjs, prepare-d1.py, validate-d1-sql.py.
- Shell de Worker Cloudflare aislado versionado; NO desplegado.

## Pendiente

- Autorizar Wrangler en Cloudflare (OAuth del navegador) para crear base D1 de laboratorio.
- Crear D1 vacío separado e importar SQL desde PC (datos privados).
- Verificar índices, integridad y paridad remotas en D1.
- Inventariar/trasladar los JSON y assets del catálogo a R2/D1.
- Portar backend completo, incluyendo login, VIP, descargas, tickets, dispositivos, cobros y webhooks.
- Integrar código web de la rama de producción del frontend, que no es idéntica a staging del backend.
- Test de extremo a extremo, sincronización de cambios posteriores al snapshot y corte de dominio.
- Railway y www.gabokaraoke.com sin cambios de despliegue.

**IMPORTANTE:** los snapshots son una foto temporal, NO un nuevo sistema vivo. Los cambios de usuarios, pagos, cuotas o catálogo posteriores al respaldo deben reconciliarse en una etapa final. Nunca publicar archivos .sqlite/.sql ni tokens.

## Avance posterior — Cloudflare autorizado y LAB creado

- Inicio de sesión de Wrangler reparado y completado desde PC autorizada.
- D1 independiente creado: `djgabo-actualizaciones-migration-lab`, UUID `2080630d-7abc-4c9c-8dfb-670bab160030`, región ENAM.
- Importación remota exitosa mediante `wrangler d1 execute --remote --file`: 41 693 instrucciones; 20 tablas.
- Comprobación en D1: los 20 recuentos coinciden con snapshot real; 41 648 registros totales.
- 25 índices definidos por usuario en origen y réplica; coincidencia.
- `PRAGMA foreign_key_check` remoto sin infracciones.
- D1 no autoriza `PRAGMA integrity_check` remoto (SQLITE_AUTH); integridad del respaldo y de la restauración temporal sí fueron verificadas antes del envío.
- Worker nuevo e independiente desplegado: https://djgabo-actualizaciones-cloudflare-lab.clubkaraokedjgabo.workers.dev/health
- Endpoint `/health`: HTTP 200, `database=ok`. Todos los endpoints comerciales siguen DESHABILITADOS.
- NO se cambiaron DNS, Railway, API comercial ni sitio web.
- La D1 remota es una foto del 2026-11-10 00:44 UTC, NO sincroniza cambios posteriores automáticamente.
- Pendiente: portar funcionalidades completas, migrar catálogo JSON/R2, validar login y políticas, sincronización final y cambio controlado.

## Fase catálogo público — desplegada y verificada (2026-11-09 Lima)

- Se extrajeron exclusivamente los JSON públicos desde el archivo privado catalog.tar.gz: 145 catálogos mensuales + version.json.
- Se aplicó lista blanca de campos públicos para impedir subir archivos privados, rutas Dropbox, claves y configuraciones.
- Se publicaron 146 assets mediante Workers Static Assets en el Worker de LAB, conservando binding D1 y `/health`.
- Rutas nuevas SOLO de lectura:
  - `/api/catalog/version.json`
  - `/api/catalog/YYYY/MM/index.json`
- Las rutas de login/descarga/admin y los nombres directos de archivos privados devuelven 404.
- Se validó respuesta HTTP 200 de `/api/catalog/version.json` y `/api/catalog/2026/09/index.json`.
- Se verificó paridad con Railway en ocho periodos de 2012 a 2026: MATCH; iguales listas y recuentos por documento.
- Septiembre 2026: 244 karaokes y 5 marcas/productores en ambos.
- Catálogo público total en copia de LAB: 20 110 entradas. Los 20 233 karaokes en D1 incluyen registros no visibles en esos JSON.
- Cuidado: por ahora el JSON del LAB es una foto, NO tiene sincronización incremental. No conmutar DNS ni usar como panel comercial.
- Próxima tarea: compatibilizar los endpoints públicos restantes y desarrollar capa segura de autenticación/autorización en Workers contra D1, con pruebas de cuotas/dispositivos; no abrir datos privados antes de validar seguridad.
