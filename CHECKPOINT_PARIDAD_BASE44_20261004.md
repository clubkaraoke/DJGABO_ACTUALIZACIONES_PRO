# CHECKPOINT_PARIDAD_BASE44_20261004

Fuente de verdad funcional para la migración del portal VIP desde Base44 al frontend propio.

## Catálogo mensual: reglas NO negociables

1. `index.json` mensual es la fuente de verdad de lo que el cliente puede ver.
2. Los registros heredados del seed técnico no forman parte del catálogo real y no deben renderizarse ni contarse.
3. Nunca crear una carpeta pública por fallback a partir de un sourceGroup desconocido.
4. Una nueva fuente física requiere mapeo explícito antes de hacerse visible.

### Alias públicos aprobados

| Fuente privada / física | Nombre público |
| --- | --- |
| 01_Club_KARAOKE / Club Karaoke | Club Karaoke |
| 02_KK-Live / KK Live | Top Hits 01 |
| 03_LuisFer / Luis Fer | Top Hits 02 |
| 04_Dj_SA / DJ Sauly | Top Hits 03 |
| 05_Rfk / RFK / Rafiki | Top Hits 04 |

No existe `Top Hits 05` en la estructura actual.

## Nombres públicos de karaoke

La UI pública muestra únicamente:

`ARTISTA - TÍTULO (VARIANTE)`

Se conservan variantes musicales útiles como Coros, Instrumental, Segunda voz, En vivo, Edit, Dúo, Versión femenina o Versión masculina.

Se eliminan visualmente firmas/marcas de productor o karaoke como LF Karaokes, Luis Fer, DJ Sauly Karaoke, KK Live, KKL, RFK, Rafiki, Karaokanta, DJGABO usado como firma de archivo, etc.

Los nombres físicos y rutas originales NO se modifican. La descarga debe continuar usando el asset/ruta privada real.

## Buscador

El buscador principal es global y debe responder:

`¿Existe este karaoke y dónde está?`

Debe buscar por título, artista, título + artista y código, usando valores públicos limpios. El resultado debe indicar la actualización y la carpeta pública (Club Karaoke / Top Hits 01-04) y enlazar al detalle correspondiente. No debe revelar marcas privadas ni devolver registros seed fuera del catálogo real.

Los Mega Packs se incorporarán al buscador cuando exista su catálogo real; no se simulan resultados.

## Dropbox / descargas

No renombrar ni mover carpetas o archivos de Dropbox.
No cambiar storageKey, path, providerFileId ni estructura física para conseguir aliases visuales.
Los aliases son exclusivamente de presentación.

## Covers

Los covers mensuales son assets visuales del frontend. El problema de resolución/sprites queda separado y no debe mezclarse con catálogo o descargas hasta que se retome expresamente.

## Estado del bloque de usuarios del checkpoint Base44

El checkpoint original también define el objetivo posterior de visitante público, membresías, permisos, sesión única y Panel Admin. La arquitectura Railway actual ya posee AuthorizationService, usuarios, planes, accesos, dispositivos, tickets y guards propios, pero no se debe afirmar paridad completa con ese bloque Base44 sin una migración específica y pruebas end-to-end.

Este documento impide que una corrección visual del catálogo modifique silenciosamente autenticación, Dropbox, tickets o backend estable.
