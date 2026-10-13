# CHECKPOINT · DJGABO ACTUALIZACIONES PRO · 2026-10-12 · Planes comerciales y pedidos gratis

## Autorizado
- Plan 30 días: US$59.99; acceso a elegir 3 actualizaciones de 2026; 3 karaokes a pedido gratis durante el ciclo.
- Plan 6 meses: US$149.99; todo el año de compra más 6 meses de novedades; 5 pedidos de karaoke gratis cada mes.
- Plan 12 meses: US$189.99; todos los años históricos y 12 meses de novedades; 15 pedidos de karaoke gratis por mes = hasta 180 al año.
- Pedidos mensuales no acumulables, no se permite reclamar gratis fuera de una membresía activa. Pedidos duplicados o canciones ya disponibles no gastan cupo; rechazados no contabilizan.
- Límite mensual se reinicia por aniversario del inicio del plan, NO el primero del mes calendario. Plan mensual dura 30 días.
- Los controles antiabuso de descargas de carpeta no cambian: 2 por carpeta/día y 5 carpetas distintas/día por defecto.

## Implementación
- Backend: comercialPlans.ts alinea nombres/precios del Admin con la web sin modificar la vigencia de cuentas existentes.
- KaraokeRequestQuota.ts calcula periodos y cupos por cliente desde plan/status/inicio/vencimiento y solicitudes persistentes.
- Servicio de pedidos: registra a lo sumo el cupo permitido y serializa modificaciones del JSON compartido en el único backend; duplicados no consumen saldo; no ofrece pedidos gratis si no hay plan activo.
- GET /api/karaoke-requests/quota retorna cupo, usados, restantes y fin de periodo, solo autenticado.
- En caso de agotamiento, POST devuelve HTTP 429 y texto claro. Fuera de membresía HTTP 403.
- Web: tarjetas de precios y descripción comercial, destaque hasta 180 pedidos en anual; página de pedidos muestra saldo y próxima renovación.
- Las solicitudes siguen requiriendo envío manual de YouTube; no hay generación automática del karaoke ni cobro/pasarela.
- Botones "Suscribirme" de PlansPage conservan comportamiento previo sin checkout integrado. No afirmar que se completó integración de pago.

## QA
- Compilación backend TypeScript y web Vite.
- Pruebas unitarias y de integración: cuotas por plan, reinicio, concurrencia, duplicados y política comercial.
- No tocar reproductor CDG sellado, Dropbox, WAV/CDG, flujo ZIP ni frontend de Studio.
