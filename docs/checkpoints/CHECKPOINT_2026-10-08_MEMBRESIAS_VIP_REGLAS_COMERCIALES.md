# CHECKPOINT · DJGABO Actualizaciones PRO · Membresías VIP · 2026-10-08

Proyecto: gabokaraoke.com. Repo clubkaraoke/DJGABO_ACTUALIZACIONES_PRO.
Backend Railway: staging. Frontend Railway: migration/vip-base44-export-20261004.

## Reglas comerciales aprobadas
- 1 MES — US$59.99: ver todo el catálogo y escuchar demos. Descargar solamente 3 colecciones distintas de 2026 durante 30 días. Ninguna carpeta de otros años.
- 6 MESES — US$139.99: descargar todas las actualizaciones del año de compra, más las publicaciones durante los siguientes 6 meses. Ejemplo: septiembre 2026, año 2026 completo y novedades hasta marzo 2027. Sin acceso de descarga a años anteriores.
- 12 MESES / Pro Anual — US$179.99: descarga de todo el histórico disponible y publicaciones nuevas mientras la membresía está vigente.
- Los tres planes visualizan el catálogo y escuchan demos.
- Precios en web; no se implementó pasarela de pagos.

## Implementado
- Reglas de autorización de servidor dinámicas por plan, fecha, año y mes de la colección. No otorgar permisos manualmente por cada carpeta ni por cada año.
- Slugs: pro-mensual, pro-semestral, pro-anual; garantizar existencia en DB al iniciar la API, conservar IDs previos. Planes no comerciales conservan permisos explícitos anteriores.
- Bloqueos de colección individuales desde Admin, con restauración al acceso automático.
- Plan mensual: tres selecciones registradas, reinicio cuando cambia fecha de inicio de membresía y se renueva.
- Admin puede elegir plan, y el backend calcula inicio/vencimiento (30 días/6 meses/12 meses). Las fechas se pueden ajustar.
- Fallar cerrado ante fechas incompletas, expiración o suspensión.
- Botón de descarga del frontend usa el estado efectivo del backend.

## Antiabuso preservado
- 2 descargas por carpeta/día, 5 carpetas distintas/día por defecto; otros límites pueden administrarse por plan.
- Zona horaria America/Lima; ticket seguro expira en 90 s, un solo uso, usuario/dispositivo/recurso, sin enlace público a Dropbox.
- Descarga individual de karaoke permanece desactivada para usuarios VIP según interruptor Admin.
- El plan anual no elimina los límites diarios.

## Validación
- Compilación TypeScript backend y Vite frontend, correcto.
- 9 pruebas específicas de planes, acceso real SQLite, bloqueo manual, reinicio de selecciones, configuración de descarga individual.
- Fixture SQLite del testApp actualizado para incluir columnas y tablas de producción.
- Suite antigua: pruebas que esperan endpoints inseguros de descarga directa responden 410, según el diseño vigente. No restaurar esos endpoints.

## No modificar
- Motor de reproductor CDG sellado.
- Portadas automáticas (p. ej. error Majo Aguilar/Almohada) pospuesto expresamente.
- Studio de separación de pistas es otro proyecto.
