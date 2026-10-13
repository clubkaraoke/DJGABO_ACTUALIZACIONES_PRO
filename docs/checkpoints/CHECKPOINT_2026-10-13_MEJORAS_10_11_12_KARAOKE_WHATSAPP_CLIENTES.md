# CHECKPOINT DJGABO ACTUALIZACIONES PRO — Mejoras 10, 11, 12
Fecha: 2026-10-13. Repo: clubkaraoke/DJGABO_ACTUALIZACIONES_PRO.

## Respaldos previos
- API Git tag checkpoint-before-10-11-12-api-20261013 (branch staging).
- Web Git tag checkpoint-before-10-11-12-web-20261013 (branch migration/vip-base44-export-20261004).
- NO tocar reproductor CDG ni videos/Dropbox físico.
- Los archivos locales sin seguimiento apps/api/data y apps/web/public/covers/sprites se dejan fuera de todos los commits.

## 10 — Carpeta o Todas A–Z
- Vista predeterminada «Por carpetas» intacta.
- Selector en ficha de cada actualización, móvil y escritorio.
- Vista «Todas A–Z» reúne exclusivamente los karaokes de los grupos públicos ya disponibles, ordenados por título presentado, luego artista y código, manteniendo carpeta de origen junto a cada karaoke.
- Se reutiliza KaraokeRow original para demos y descarga; no se crea carpeta real ni se altera Dropbox.
- Tests web: alphabeticalCollection.test.ts.

## 11 — Suscribirse por WhatsApp
- Botones «Suscribirme» de /planes enlazan al WhatsApp comercial +51 921 675 846.
- Texto prellenado identifica plan y precio en USD obtenidos de GET /api/public/plan-offers (Admin es fuente única).
- Compra y comprobación de pago manuales, sin pasarela.
- Tests web: planWhatsApp.test.ts.

## 12 — Nuevo cliente pagado manualmente
- Ruta Admin → Clientes → Nuevo cliente; datos: nombre, email, WhatsApp internacional, plan vigente, medio/importe/moneda/referencia y confirmación de pago.
- Backend protegido ADMIN: POST /api/admin/clients/manual.
- Rechaza email y WhatsApp duplicados, así como números reservados para VIP antiguos.
- Crea usuario MEMBER ACTIVE con la duración del plan (30 días, 6 meses, 12 meses) y guarda comprobante en manual_customer_payments.
- No se entrega contraseña. Se genera token seguro aleatorio, solo SHA256 en SQLite, caduca 48 horas y se usa una sola vez; enlace con fragmento #token para evitar enviarlo en GET.
- POST /api/auth/activate-manual-client activa contraseña personal; POST /api/admin/clients/:id/activation-link permite reenviar enlace si aún no se ha activado. Token nuevo invalida token anterior.
- Admin → Clientes muestra WhatsApp manual y permite administrar plan/vigencia y renovaciones desde la ficha existente sin duplicar cuentas.
- Se agregan tablas auxiliares manual_customer_accounts y manual_customer_payments (migración aditiva sin borrar datos).
- Tests backend: manual-client-registration.test.ts.
- No crear clientes reales ni generar tokens privados en producción en las pruebas automatizadas.

## Validación local
- API npm run build, Web npm run build.
- 17 tests backend: manual + migración VIP + cuota y planes.
- 5 tests web: A–Z, WhatsApp, planes y paquetes.
- Validación en Railway API primero, Web después, comprobación de salud, rutas, planes, accesibilidad y no regresión.

## Recuperación
- Tags anteriores en GitHub listados arriba; no deshacer migraciones eliminando tablas (son aditivas).
- No se realizaron cambios en el reproductor CDG.
