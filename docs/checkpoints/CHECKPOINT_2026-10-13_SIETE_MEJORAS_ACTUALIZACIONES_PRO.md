# CHECKPOINT — 7 mejoras de Actualizaciones PRO — 2026-10-13

## Alcance aprobado
1. Cinco textos comerciales aprobados (1 eliminación, 4 sustituciones) y precios 59.99/149.99/189.99.
2. Colecciones: nuevas en preparación por defecto; Octubre 2026 pasa una sola vez a preparación; visible como anuncio sin demos/listados/descargas; publicación manual Admin, ZIP bajo demanda.
3. Enlace VIP compartido único y whitelist Admin.
4. Un registro por WhatsApp, normalización internacional y OTP de seis dígitos remitido manualmente por el administrador vía WhatsApp (24 h); bloqueo de reutilización.
5. VIP Anual automático con 15 pedidos gratuitos por mes, acceso inmediato y caducidad definida por Admin (sin regalar doce meses).
6. Ocultar plan heredado Básico en listas de planes oficiales; sin eliminarlo de la base de datos.
7. Editar textos y precios en Admin y reflejarlos en página pública, sin cambiar privilegios técnicos.

## Datos y privacidad
- 12 números seleccionados en Excel de Google Drive, 5 de 2025 y 7 de 2026.
- Se almacenan por variable privada de Railway `VIP_INITIAL_ALLOWED_CONTACTS`; no guardarlos en Git ni en reportes.
- La variable de invitación existente `VIP_MIGRATION_INVITE_CODE` se reutiliza, su valor no se comparte públicamente.
- Los códigos de seis dígitos no se almacenan en claro en el servidor; se conserva HMAC con expiración de 24 horas.

## Arquitectura
- Backend: branch `staging`, Railway service `djgabo-actualizaciones-webapi`.
- Frontend: branch `migration/vip-base44-export-20261004`, Railway service `djgabo-cp70-preview`.
- Bases SQLite se actualizan de manera aditiva: tres tablas auxiliares y la columna de control de vencimiento.
- El reproductor CDG permanece intocado.

## Rollback de código
- API: tag `checkpoint-before-7-upgrades-api-20261013`.
- Web: tag `checkpoint-before-7-upgrades-web-20261013`.
- Para rollback no borrar tablas nuevas; versiones anteriores pueden ignorarlas.

## Pruebas
- Compilaciones TypeScript API y Vite Web finalizadas sin error.
- Vitest 6 pruebas nuevas de migración VIP, cuota y publicación: aprobadas.
- Vitest heredados de descarga esperan la API antigua, que ya devolvía HTTP 410 en el checkpoint previo; no restaurar ruta obsoleta.
- Test público de precios recompuesto para el proveedor React Query.
- Despliegue: verificar API saludable, registrar listas, portal público, ZIP y no regresión CDG antes de considerar concluida.
