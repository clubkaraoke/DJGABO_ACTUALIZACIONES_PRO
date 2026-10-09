# CHECKPOINT 2026-10-09 — Pastillas Karaoke y covers nuevos

Proyecto: DJGABO Actualizaciones PRO · gabokaraoke.com
Rama frontend: migration/vip-base44-export-20261004

## Cambios visuales
- Etiquetas tipo pastilla compactas y con radio 4px: Karaoke (gris oscuro), Coro (amarillo), En vivo y Live Session (morado).
- Los títulos visibles eliminan el texto técnico Karaoke, Coro, En vivo, Live Session cuando sean indicadores de versión; no cambia el título en BD ni los WAV/CDG.
- Badges presentados en Inicio/Nuevos Karaokes, listado de actualización (desktop/móvil), resultados de búsqueda y cards reutilizables.
- Karaokes Nuevos Agregados: covers aumentados de 56px a 64px en móvil y de 64px a 72px en pantallas sm+.
- Detección basada en el título original, sin inventar etiquetas; Karaoke se muestra como pastilla de tipo base en todos los karaokes.
- Mantener búsqueda por título crudo para encontrar términos que solo están en etiquetas.

## Protección
- Sin cambios en el reproductor CDG, permisos, tickets de descarga, descargas por carpeta, planes, backend ni archivos Dropbox.
- Test: publicCatalogPresentation.test.ts (6 casos) y KaraokeRow.test.tsx (3 casos). Build web correcto.
