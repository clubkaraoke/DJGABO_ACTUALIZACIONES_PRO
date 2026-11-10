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
