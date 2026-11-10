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

## Segunda fase de API y preparación VIP (2026-11-09, Perú)

- Se migraron a D1 y desplegaron las rutas públicas `GET /api/public/collections`, `GET /api/public/collections/:id` y `GET /api/public/karaokes/search`.
- Pruebas REST: listado de 144 colecciones idéntico; detalles de 2012, 2021, 2025 y septiembre 2026 idénticos.
- Diferencias verificadas: octubre 2026 contiene 62 portadas actualizadas en Railway después del snapshot, aún ausentes en D1. Algunas búsquedas tienen distinto orden en empates; las entradas no cambian salvo un resultado en el límite 200 para una búsqueda por artista.
- Implementación de autenticación aislada con bcryptjs, JWT HS256 mediante Web Crypto, refresh opaco y revocable, y límite de registro de dispositivos con inserción atómica.
- Seguridad LAB: rutas autenticadas requieren `X-Lab-Key` y solo permiten cuentas sintéticas cuyo ID empieza con `labusr_`. No habilitar cuentas reales antes de completar rate limiting, sincronización, pruebas y cambio controlado.
- También se implementó lectura VIP de colecciones y reglas de planes mensual, semestral y anual. Sin emitir tickets ni permitir descargas.
- La tabla `lab_auth_rate` existe exclusivamente en D1 LAB (se suma a las 20 originales).
- Se creó un usuario de laboratorio ficticio con plan anual en la D1 de prueba. Su contraseña está exclusivamente en el directorio PRIVADO de la PC, no en GitHub ni en este registro. Es normal que la copia LAB tenga ahora 15 usuarios frente a los 14 del snapshot.
- `LAB_GATE_KEY` ya está configurado como secreto del Worker. `LAB_JWT_SECRET` **aún falta**: la prueba `verify-vip-lab.py` devolvió PENDING y no ha iniciado sesión.
- Se comprobaron bloqueos públicos: `/api/collections` y `/api/auth/me` sin clave devolvieron 404; `/health` y `/api/public/collections` devolvieron HTTP 200.
- Para activar las pruebas **solo del LAB**: añadir manualmente `LAB_JWT_SECRET` (tipo Secret) al Worker `djgabo-actualizaciones-cloudflare-lab` utilizando el valor guardado en la PC en `Documents\DJGABO_Migracion_Privada_20261109\cloudflare_lab_jwt.txt`. No enviar el valor al chat ni mostrarlo en capturas.
- Luego ejecutar `python %TEMP%\djgabo-verify-vip-lab.py` desde PC, que prueba login, GET me, colecciones VIP, registro de 3 dispositivos, rechazo del cuarto, refresh de un uso y logout.
- Ninguna función de producción ni el Worker de audio `djgabo-demo-lab` se modificó en esta fase. La migración aún NO está lista para cambiar DNS.

## 2026-11-09 noche — D1 Free quota y verificación offline completa

- El usuario añadió `LAB_JWT_SECRET` al Worker de Cloudflare LAB. El Worker lo recibe: `GET /api/auth/me` con gate válido y sin JWT devolvió 401, no 503.
- **Seguridad:** `wrangler secret list` solo refleja `LAB_GATE_KEY`; `LAB_JWT_SECRET` aparentemente quedó como variable de texto del Dashboard, no Secret. Convertirla a **Secret** antes de uso real. Nunca registrar el valor en GitHub.
- El login de cuenta ficticia falló con 500. Se inspeccionó `wrangler tail` y confirmó causa exacta:
  `D1_ERROR: Your account has exceeded D1's free tier daily row write limit.`
- D1 Free: 100 000 filas escritas/día, se reinicia a 00:00 UTC; el límite es **por cuenta**, con efecto potencial en otros proyectos D1.
- Se evitó hacer escrituras adicionales en D1 remoto. No hubo daño a datos ni cambio del sistema Railway.
- Se generó BD **local-only** con 20 tablas y 25 índices del esquema real, pero **ninguna fila real**. Se añadieron cuenta, plan anual y colección ficticios.
- Con Wrangler dev `--local --ip 127.0.0.1 --port 8898` y D1 local, `verify-vip-local.py` devolvió PASS: login válido, rechazo de contraseña incorrecta, `/me`, acceso y denegación de colecciones, 3 registros de dispositivos exitosos y cuarto 409, refresh rotatorio de un solo uso y logout revocador.
- Se preparó y desplegó en el Worker LAB manejo seguro de fallos de almacenamiento: ahora un login correcto cuando se agota D1 devuelve **503 `AUTH_STORAGE_UNAVAILABLE`**, y no un error 500 no manejado. Validado remoto. Uso `keep_vars=true` para conservar bindings configurados en Dashboard.
- Las sesiones de `wrangler dev` y `wrangler tail` se cerraron al terminar la prueba.
- Scripts nuevos: `diagnose-auth-lab.py`, `build-local-schema.py`, `seed-local-fixture.mjs`, `verify-vip-local.py`.
- Para poder validar el laboratorio D1 real: esperar 00:00 UTC (19:00 Lima) del siguiente reinicio, o pasar voluntariamente al plan Workers Paid. **No** contratar ni alterar billing sin autorización explícita. Si el backend comercial se migra a D1 se deben considerar límites y costos del plan, concurrencia y monitoreo.
- **Aún no migrado:** login de clientes reales (deliberadamente bloqueado), pagos, tickets 90s, descargas Dropbox, cuotas efectivas y frontend web. DNS de producción sin cambios.
