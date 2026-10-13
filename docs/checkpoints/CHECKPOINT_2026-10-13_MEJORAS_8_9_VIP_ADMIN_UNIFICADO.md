# CHECKPOINT — DJGABO Actualizaciones PRO — Mejoras 8 y 9

Fecha: 2026-10-13. Proyecto: clubkaraoke/DJGABO_ACTUALIZACIONES_PRO.

## Acuerdo
- Admin > Planes es la unica fuente de la cuota de karaokes gratuitos. Un campo numerico especifico controla los pedidos reales; el texto promocional se genera del mismo valor.
- Precios, nombres y descripciones editables existentes siguen en Admin.
- Los cambios se reflejan en /planes, /paquetes (bloques VIP), cuotas del cliente y mensaje WhatsApp para invitaciones antiguas.
- El enlace de invitacion es comun y cada cliente mantiene un codigo personal de seis digitos, de un solo registro (24 horas). El envio sigue siendo manual por WhatsApp, nunca se afirma envio automatico.
- Mensaje profesional: nuevo panel exclusivo, retomar actualizaciones pendientes, pedidos gratis dinamicos, acceso 24/7, entregas desde panel en lugar de WhatsApp, futuras compras, URL compartida y codigo.

## Migracion: conservar lo que ya modifico el usuario
- Se agrega plan_marketing.free_requests_per_month INTEGER.
- En la primera instalacion se lee la cantidad de pedidos gratis del texto actualmente guardado en plan_marketing.items, en vez de reiniciar a los viejos predeterminados.
- En produccion, el 2026-10-13 antes de migrar, los valores comerciales eran 1 (Mensual), 2 (Semestral), 5 (Anual), con beneficio total anual 60.
- Cambios futuros al campo numerico se guardan sin volver a recalcular a partir del texto ni del codigo; el backend controla la cuota real con ese valor.
- Bonus anual que menciona total de pedidos gratis ajusta total segun 12 * cuota mensual.
- No alterar reglas de membresias, descargas, dispositivos, contratos ni seguridad.

## Pre-patch rollback
- API: tag checkpoint-before-8-9-upgrades-api-20261013
- Web: tag checkpoint-before-8-9-upgrades-web-20261013
- Railway backend service 335db340-13b1-4b79-975e-c5e6bcd67af0 (branch staging)
- Railway frontend 3f3422c0-8093-42d6-889a-b7380f94c57e (branch migration/vip-base44-export-20261004)
- NO se toco reproductor CDG.

## Pruebas
- Vitest migracion SQLite: respeta 1/2/5 y conserva nuevos valores despues de reiniciar.
- Vitest Admin -> cuota real -> oferta publica -> WhatsApp: comprobado en test.
- Vitest no duplicar beneficio y codigo de invitacion seguro: comprobado.
- Web Planes: interfaz no anuncia numeros obsoletos si API no responde; tests de montos editados.
- Antes de finalizar: compilar ambos, verificar commits y despliegues Railway, salud API y valores publicos, estado de Octubre/Septiembre.
