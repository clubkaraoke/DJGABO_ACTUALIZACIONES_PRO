# Checkpoint · DJGABO Actualizaciones PRO · 2026-10-08
Repos: clubkaraoke/DJGABO_ACTUALIZACIONES_PRO
Servicios: backend rama staging, frontend rama migration/vip-base44-export-20261004

## Mejora 8 · Botones comerciales «Descargar»
- Restaura botón por fila de karaoke, escritorio y móvil, sin habilitar descargas individuales VIP.
- Sin cuenta o sin plan → modal de planes/inicio VIP.
- Con plan habilitado para esa colección → modal explicando «solo carpeta completa» y acción al modal BatchDownloadModal existente.
- Con plan fuera de colección o límites → mensaje orientando a planes o descarga de carpeta según permiso.
- Admin puede mantener descarga individual solamente cuando el interruptor backend esté habilitado.
- No modificar el reproductor CDG, ticket backend, WAV/CDG ni antiabuso.

## Mejora 9 · Portadas automáticas
- Emparejado estricto por cantante y título, nunca solo título. Deezer principal e iTunes de respaldo.
- Auditoría única de cache de asignaciones automáticas previas: retirar solamente portadas con evidencia de artista erróneo y URL original inalterada; conservar cambios manuales.
- Caso reportado Majo Aguilar — Almohada, Deezer URL incorrecta conocida: volver a resolver por nombre exacto y aplicar si hay resultado con cantante coincidente. Apple Music devuelve resultado de Majo y Almohada.
- Volver a generar los index.json del catálogo cuando se invalida una portada y después de enriquecimiento.
- AuditVersion 1 persiste en cover-provider-cache.json para evitar análisis destructivos repetidos.
- Sin garantía de identificar automáticamente errores antiguos sin metadatos de procedencia; esos pueden requerir revisión manual adicional.

## Validación
- tsc backend y frontend build correctos.
- Pruebas cover-matching (5), cover-audit integration SQLite (1); regresiones de audio/plan correctas.
- Confirmar ambos Railway SUCCESS y coverUrl corregida visible en API pública.
