# CHECKPOINT DE CONTINUACIÓN — DJGABO ACTUALIZACIONES PRO
Fecha: 2026-10-07
Proyecto: DJGABO ACTUALIZACIONES PRO / VIP Karaoke Hub
Estado: CONTINUACIÓN SELLADA
Objetivo: que cualquier chat nuevo pueda retomar el proyecto sin retroceder, sin rehacer decisiones ya cerradas y sin romper flujos que ya funcionan.

---

## 0. REGLA MAESTRA DE CONTINUIDAD

Este documento continúa el checkpoint anterior:
- Drive: CHECKPOINT_2026-10-06_DJGABO_ACTUALIZACIONES_PRO.md
- Proyecto Drive: 00_AI_PROJECT_STATES_DJGABO/DJGABO_ACTUALIZACIONES_PRO
- GitHub: clubkaraoke/DJGABO_ACTUALIZACIONES_PRO

REGLA OBLIGATORIA PARA EL SIGUIENTE CHAT:
1. Leer este checkpoint y el checkpoint del 2026-10-06 antes de tocar código.
2. No revertir, simplificar ni reinterpretar flujos sellados.
3. No cambiar arquitectura, permisos, rutas, reglas comerciales, diseño global, tipografías o componentes compartidos sin autorización expresa.
4. Separar siempre:
   - verificado en código/repo,
   - verificado en Railway,
   - verificado visualmente en web,
   - pendiente de confirmación visual final.
5. Nunca declarar “cerrado”, “listo” o “sellado” si solo existe código sin build/deploy/verificación.

---

## 1. IDENTIDAD Y ARQUITECTURA ACTUAL

### Proyecto
DJGABO ACTUALIZACIONES PRO / VIP Karaoke Hub.

### GitHub
Repositorio:
clubkaraoke/DJGABO_ACTUALIZACIONES_PRO

Frontend branch activa:
migration/vip-base44-export-20261004

Backend branch activa:
staging

### Railway
Proyecto:
djgabo-actualizaciones-staging

Project ID:
283c7794-a331-4c09-bbf9-b54dddb583ce

Environment Production:
145ca85b-90fe-405c-81fe-4f42221f8627

Frontend service:
3f3422c0-8093-42d6-889a-b7380f94c57e

Backend service:
335db340-13b1-4b79-975e-c5e6bcd67af0

Frontend público / preview:
https://djgabo-cp70-preview-production.up.railway.app

Backend:
djgabo-actualizaciones-webapi-production.up.railway.app

### Flujo de infraestructura
Navegador
→ Frontend React/Vite
→ /api por proxy Nginx
→ Railway backend
→ Base de datos / catálogo
→ Dropbox para fuentes/paquetes/archivos
→ proveedor de covers cuando corresponde

NO exponer namespace, credenciales, tokens, secretos ni rutas privadas de Dropbox.

---

## 2. FLUJO PÚBLICO — SELLADO

La web ahora es pública para exploración.

### Visitante sin login
Puede:
- entrar a Inicio;
- entrar a Actualizaciones;
- entrar a Paquetes;
- entrar a A pedido;
- entrar a Planes y Precios;
- navegar años, meses, colecciones y carpetas;
- buscar karaokes;
- ver portada, título, artista, código, formato y tamaño;
- reproducir demos Club Karaoke cuando demoAvailable=true.

No puede:
- descargar un karaoke;
- generar ticket de descarga;
- descargar colección completa;
- usar A pedido realmente.

### Acceso VIP
Entrada fija principal:
- “Acceso VIP” en el sidebar izquierdo.

Se eliminó el acceso duplicado del extremo superior derecho para visitantes.

### Descarga visitante
Al tocar Descargar o Descargar todo:
- no descarga;
- aparece modal “Acceso VIP requerido”;
- ofrece Acceso VIP;
- ofrece Ver planes.

### Seguridad
Los endpoints privados continúan protegidos.
Verificación previa real:
- /api/collections sin login → 401
- ticket de descarga sin login → 401

SELLADO:
la web puede mostrar contenido público, pero nunca debe liberar descargas por omitir autenticación.

---

## 3. LOGIN — SELLADO

Pantalla:
DJGABO KARAOKE VIP

Campos:
- Correo electrónico
- Contraseña
- Ingresar

Mejora sellada:
- “← Volver al panel”

El retorno después de login conserva la ruta de origen cuando corresponde.

No volver a eliminar el botón de retorno.

---

## 4. A PEDIDO — SELLADO

La sección debe verse completa incluso al visitante.

El visitante puede ver:
- campo de enlace YouTube;
- botón Solicitar karaoke;
- bloque Mis solicitudes.

Pero no puede ejecutar la solicitud.

Al hacer clic en “Solicitar karaoke” sin acceso:
→ modal Acceso VIP requerido.

Mensaje implementado:
la sección A pedido es exclusiva para usuarios VIP.

La query privada de solicitudes solo corre si existe usuario autenticado.

SELLADO:
NO ocultar A pedido al visitante. Debe servir como demostración comercial de que esa función existe.

---

## 5. LISTADO DE KARAOKES RESPONSIVE — SELLADO

Problema anterior:
en móvil la tabla horizontal se cortaba y los botones Play/Descargar quedaban fuera de pantalla.

Solución implementada:
- escritorio conserva tabla;
- móvil usa layout propio;
- título de canción en primera línea;
- artista como subtítulo;
- código / formato / tamaño debajo;
- Play y Descargar visibles debajo;
- no depender de min-width rígido en móvil.

Regla visual:
Título Canción
Subtítulo: Artista

No volver al formato largo “Artista - Canción - metadatos” como una sola línea principal.

---

## 6. DEMOS CLUB KARAOKE — SELLADO FUNCIONAL

Las demos públicas solo corresponden a contenido Club Karaoke elegible.

Backend expone configuración pública de demo para karaokes permitidos.

Se verificó anteriormente:
- config pública OK;
- audio demo HTTP 200;
- audio/mpeg;
- reproducción real de demo.

No abrir demos técnicas/privadas indiscriminadamente.

---

## 7. REPRODUCTOR CDG EMBEBIDO — HISTORIAL DE PROBLEMAS Y SOLUCIONES

### Problema A
En móvil había demasiado espacio negro debajo de Play + tiempos + barra.

### Problema B
En escritorio el transport quedó demasiado comprimido al intentar compactar móvil.

### Problema C
La causa real no era solo padding.
El iframe tenía altura calculada con una fórmula fija y podía:
- dejar espacio negro sobrante,
- o quedar demasiado justo.

### Correcciones aplicadas
1. Modal centrado verticalmente.
2. Reglas separadas móvil/escritorio.
3. Desktop recuperó aire:
   - margin superior transport 8px;
   - padding 10px 12px;
   - min-height 60px.
4. Móvil conserva reglas compactas:
   - breakpoint max-width:700px;
   - margin 2px;
   - padding 6px 8px 8px;
   - min-height 54px.
5. Solución estructural final:
   el iframe ya no debe depender únicamente de una altura “a ojo”.
   El player embebido mide el alto real de .player-card y lo comunica al padre con:
   DJGABO_CDG_PLAYER_HEIGHT
6. El modal escucha ese mensaje y ajusta dinámicamente playerHeight.
7. Se mantiene fallback de altura solo mientras llega la medición real.

### Commits clave del player
dbd6f73 — player: tighten embedded mobile spacing
63470f9 — player: restore desktop transport spacing
77ac8cd — player: size demo iframe to rendered content
38c3c09 — player: report embedded content height

### Estado
Railway:
38c3c09 desplegado SUCCESS.

IMPORTANTE:
la arquitectura de altura dinámica queda SELLADA.
No volver a “arreglar” el problema solo aumentando/disminuyendo un número fijo del iframe.

Pendiente únicamente:
confirmación visual final del usuario en escritorio y móvil después de 38c3c09.
No confundir “deployment SUCCESS” con “validación visual final”.

---

## 8. INICIO — ÚLTIMA ENTREGA

Mejora implementada:
la sección “Última entrega · NUEVO” dejó de mostrar solo unas pocas cards grandes.

Ahora:
- toma hasta 10 colecciones/covers recientes;
- cards más compactas;
- columnas responsivas;
- en pantallas grandes puede mostrar hasta 10 en una franja.

Commit relacionado:
09cd346 — web: refine recent covers packages and VIP plan messaging

SELLADO:
no volver a 4/5 covers grandes salvo nueva decisión comercial.

---

## 9. PLANES Y PRECIOS — DIRECCIÓN VISUAL SELLADA

### Principio aprobado por usuario
Se tomó como referencia la lógica visual compacta de Peru BPM:
- menos texto;
- más aire;
- precio protagonista;
- cards limpias;
- plan popular destacado;
- beneficios cortos;
- CTA claro.

NO copiar identidad ajena.
NO cambiar:
- tipografías;
- fuentes;
- paleta;
- diseño global;
- tokens;
- botones base;
- sidebar base.

La página debe seguir sintiéndose 100% DJGABO.

### Título aprobado
Planes y Precios — Actualizaciones Karaoke

### Posicionamiento comercial aprobado
El VIP NO es la venta de una base completa de 28k/30k karaokes.

VIP = actualizaciones para alguien que ya tiene una colección.

Mensaje actual:
“Mantén tu colección al día con nuevos karaokes y entregas DJGABO. Ideal si ya cuentas con una base de karaoke y quieres seguir actualizándola.”

### Cards actuales
1 MES
- 3 descargas VIP
- 3 colecciones de actualizaciones
- 3 karaokes a pedido
- Guarda en tu Dropbox

6 MESES
- Actualizaciones 2026
- Nuevos lanzamientos
- 5 karaokes a pedido por mes
- Descargas ilimitadas

1 AÑO
- Actualizaciones 2026–2012
- Nuevos lanzamientos
- 15 karaokes a pedido por mes
- Descargas ilimitadas

Plan 6 meses:
MÁS POPULAR

### Commit
29ecfbc — web: compact VIP plans presentation

SELLADO:
la diferencia comercial entre “Paquetes” y “Actualizaciones VIP” no debe volver a mezclarse.

---

## 10. PAQUETES — DIRECCIÓN VISUAL Y ERROR CORREGIDO

### Error cometido y corregido
Se interpretó incorrectamente que el usuario quería un sidebar contextual exclusivo para Paquetes.

Se añadió temporalmente:
- PACKS KARAOKE
- Colecciones completas listas para usar
- Ver Paquetes
- ¿Ya tienes una colección?
- Ver Actualizaciones VIP

El usuario rechazó ese bloque.

### Corrección sellada
El sidebar de Paquetes volvió al sidebar normal anterior:
- MEMBRESÍA VIP
- Explora gratis
- Acceso VIP
- Planes y Precios

NO volver a crear un sidebar especial para Paquetes.

### Mejora correcta
La mejora debía aplicarse al CONTENIDO PRINCIPAL de Paquetes, usando la misma lógica visual compacta de Planes.

Se compactaron:
- encabezado;
- cards;
- precio;
- jerarquía;
- beneficios;
- secciones;
- CTA.

### Packs actuales

BASIC
$49 · 150 GB
- 10.000 Karaokes español MP4
- 4.000 Karaokes inglés MP4
- Géneros variados

PRO
$249 · 300 GB
- 28.000 Karaokes español MP3+G
- 4.000 Karaokes inglés MP3+G
- 5.000 Top Hits 2026-2021

Herramientas Pro
- Reproductor Karaoke
  Cambia el tono de las canciones para adaptarlas a cada voz.
- Buscador Karaoke
  Encuentra tus karaokes en segundos desde tu PC o un disco duro externo.

Acceso VIP
- 6 meses de actualizaciones
  Incluidos gratis.
- 5 karaokes a pedido por mes
  Incluidos gratis.

PREMIUM
$349 · 800 GB
- 28.000 Karaokes español MP3+G
- 28.000 Karaokes inglés MP3+G
- 5.000 Top Hits 2026-2021

Extras Premium
- 1.500 Karaokes Internacionales
  Francés, italiano, portugués y japonés.
- 2.000 Karaokes Extras Gold
  Salsas y cumbias exclusivas para ampliar tu repertorio.

Herramientas Pro
- Reproductor Karaoke
- Buscador Karaoke
- Sistema de Pedidos de Canciones
  Recibe solicitudes directamente en WhatsApp.

Acceso VIP
- 12 meses de actualizaciones
- 15 karaokes a pedido por mes

### Iconografía aprobada
Se eliminaron flechas decorativas ➥.
Se usa:
- check amarillo para beneficio;
- descripción secundaria gris con sangría.

### Problema de layout
Después de compactar, Premium cayó a una segunda fila porque:
- ancho tarjetas + gaps ≈ 955px;
- contenedor estaba en max-width 940px.

### Solución
Contenedor desktop:
940px → 1000px

Commit:
e47cb76 — web: keep package cards on one desktop row

SELLADO:
en escritorio deben quedar Basic + Pro + Premium en la misma fila cuando exista ancho suficiente.

### Sidebar restaurado
Commit:
a8c74e3 — web: restore shared sidebar and compact packages

---

## 11. COVERS AUTOMÁTICOS — ARQUITECTURA SELLADA

La arquitectura de covers ya no debe volver al escaneo ciego original.

### Referencias arquitectónicas adoptadas
- caché persistente;
- recordar NO_MATCH;
- proveedores en cascada;
- worker con pacing;
- matching tolerante;
- procesamiento progresivo.

### Servicio actual
CoverEnrichmentService.ts

Proveedores:
1. Deezer public API
2. iTunes fallback

Cache:
${CATALOG_JSON_DIR}/cover-provider-cache.json

Estados:
- MATCHED
- NO_MATCH
- ERROR

Worker:
- procesa lotes;
- concurrencia controlada;
- cachea fallos;
- evita repetir búsquedas inútiles.

### Matching mejorado
- prioridad fuerte al título;
- directional coverage;
- bigram similarity;
- artist score secundario;
- múltiples consultas:
  1. artista + título
  2. título + tokens artista
  3. título solo
- busca varios resultados;
- acepta coincidencias cercanas según tiers.

### Prioridad
Newest-first:
orderBy(desc(karaokes.createdAt))

### UI
Panel Admin muestra:
- procesados / total;
- progreso;
- con portada;
- sin coincidencia;
- pendientes;
- errores;
- Process pending;
- Retry no-match.

### Fallback visual
Si no existe cover real:
mostrar tile neutral DJ.
NO usar cover de colección como cover de canción.
Motivo:
algunas colecciones tenían imágenes seed/no relacionadas.

### Commits clave
34a2b57 — replace blind Deezer scan with cached provider worker
06b8ecb — prioritize title similarity and reprocess misses
2ba68de — prioritize newest karaoke misses
3a6d610 — use neutral tile only until real cover resolves

### Ejemplos de metadata problemática
- Natalia Jiménez con mojibake Jim�Nez
- sufijos “- Lf Karokes”
- editores/marcas embebidos en título

El matching title-heavy permite rescatar muchos casos, pero la normalización de metadata seguirá siendo un área de mejora si se necesita aumentar cobertura.

SELLADO:
NO inventar covers.
NO usar una portada incorrecta solo para “llenar”.

---

## 12. COLECCIONES HISTÓRICAS Y CATÁLOGO

Caso detectado:
Colección 2012 mostraba conteo, pero detalle podía aparecer “No hay resultados”.

Se abrió el flujo público para colecciones activas e históricas y se corrigió navegación/búsqueda.

Verificación anterior:
2012 devolvió 148 karaokes públicamente.

No volver a filtrar de forma que colecciones históricas activas queden vacías.

---

## 13. DESCARGAS SEGURAS — SELLADO

La descarga sigue protegida por tickets del backend.

Regla:
el frontend nunca debe convertir un botón público en URL directa de Dropbox.

Visitante:
no ticket.

Usuario:
ticket según permisos/plan/reglas existentes.

No exponer enlaces permanentes de Dropbox.

---

## 14. FLUJO DE USUARIO Y PLANES — NO REINTERPRETAR

Visitante
→ explora catálogo
→ escucha demos
→ intenta descargar/solicitar
→ modal Acceso VIP requerido
→ login o planes
→ se autentica
→ se aplican reglas de su plan ya existentes.

Admin
→ acceso separado
→ Panel Admin solo si role=ADMIN.

El texto “Panel Admin” no aparece como entrada pública para visitante.

---

## 15. COMMITS RELEVANTES DE ESTA CONTINUACIÓN

Flujo público:
- 59e3229… — backend public catalog / demos
- 85cab886… — frontend public catalog + VIP download gate

UX pública:
- 3ea0a4d — refine public VIP UX and package presentation
- 09cd346 — recent covers / packages / VIP plan messaging
- 29ecfbc — compact VIP plans presentation

Paquetes:
- a8c74e3 — restore shared sidebar and compact packages
- e47cb76 — keep package cards on one desktop row

Player:
- dbd6f73 — tighten embedded mobile spacing
- 63470f9 — restore desktop transport spacing
- 77ac8cd — size demo iframe to rendered content
- 38c3c09 — report embedded content height

Covers:
- 34a2b57
- 06b8ecb
- 2ba68de
- 3a6d610

---

## 16. ESTADO DE DEPLOYMENT AL CERRAR ESTE CHECKPOINT

Frontend más reciente de esta secuencia:
commit 38c3c09aa624bee727c8de7bbeb5f3ba1e91d73f

Railway deployment:
d48c8128-119f-4af6-9599-686ce0909173

Estado:
SUCCESS

Frontend package-row deployment anterior:
e47cb767ae1fcd12dba439db2a208601a596f0e9
quedó reemplazado por deployments posteriores, pero sus cambios forman parte de la rama.

Backend latest known de cover priority:
2ba68de496b9f43fbeabb669770aec28620b41f9
deployment 58907d1b-d6af-4c78-ae88-e86c7f5808b0
SUCCESS en su verificación.

---

## 17. COSAS QUE NO DEBEN CAMBIARSE SIN AUTORIZACIÓN

SELLADO:

1. Web pública visible para visitante.
2. Descargas bloqueadas sin VIP.
3. Demos públicas solo Club Karaoke elegible.
4. Acceso VIP en sidebar izquierdo.
5. No duplicar Acceso VIP arriba para visitante.
6. A pedido visible pero bloqueado.
7. Listado móvil: título + artista + acciones visibles.
8. Sidebar normal compartido en Paquetes.
9. Planes y Paquetes comparten lógica compacta, pero no cambian identidad global.
10. VIP significa ACTUALIZACIONES, no base completa.
11. Packs significan bases completas.
12. Checks amarillos + descripción gris; no flechas ➥.
13. Basic/Pro/Premium en una fila desktop si el ancho lo permite.
14. Cover real o tile DJ neutral; nunca cover falso.
15. Worker covers con cache y proveedores; no volver a escaneo ciego.
16. Tickets seguros para descargas; no enlaces directos Dropbox.
17. Player con altura dinámica medida por contenido; no volver a depender solo de fórmulas fijas.
18. No tocar tipografías/fuentes/tokens globales por ajustes de una sola pantalla.

---

## 18. PENDIENTES REALES / NO CONFUNDIR CON BUG CERRADO

### A. Confirmación visual final del player
El fix dinámico de altura está desplegado SUCCESS.
Falta únicamente que el usuario confirme visualmente:
- escritorio sin transport aplastado;
- móvil sin franja negra inferior.

Hasta esa confirmación:
estado = DEPLOYED / PENDIENTE VALIDACIÓN VISUAL FINAL.

### B. Covers
Seguir maximizando cobertura real cuando proveedor tenga cover.
No inventar.

### C. Revisiones futuras
Cualquier nuevo cambio debe partir del estado actual, no desde versiones anteriores de Base44 ni desde commits viejos.

---

## 19. PROTOCOLO PARA EL PRÓXIMO CHAT

Antes de editar:
1. Leer este checkpoint.
2. Leer CHECKPOINT_2026-10-06_DJGABO_ACTUALIZACIONES_PRO.md.
3. Revisar HEAD de:
   - migration/vip-base44-export-20261004
   - staging
4. Verificar Railway actual.
5. Si el usuario muestra un bug visual:
   - inspeccionar breakpoint exacto;
   - no aplicar un cambio global si el bug es móvil/escritorio específico.
6. Si una mejora ya está SELLADA:
   - no rehacerla;
   - no “optimizarla” por iniciativa propia.

---

## 20. FRASE DE CONTINUIDAD

ESTADO A RETOMAR:

“DJGABO ACTUALIZACIONES PRO está en flujo público + VIP protegido, con catálogo y demos visibles, descargas seguras, A pedido visible pero bloqueado, Planes y Paquetes compactados con identidad DJGABO preservada, sidebar normal restaurado, covers con worker cacheado Deezer+iTunes y player CDG migrado a altura dinámica del contenido. No retroceder ni reemplazar estos flujos. Primero validar visualmente el último fix del player y continuar desde HEAD actual.”

FIN DEL CHECKPOINT.
