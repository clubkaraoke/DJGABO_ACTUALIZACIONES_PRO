# Checkpoint: descargas ZIP interrumpidas y restitución de cupos VIP
Fecha: 13-oct-2026. Web gabokaraoke.com — DJGABO ACTUALIZACIONES PRO.
Respaldo anterior remoto: Git tag checkpoint-before-download-refunds-20261013.
No tocar reproductor CDG ni archivos Dropbox.

## Hallazgo real
Cliente antiguo México, WhatsApp +52 1 612 348 8955, dos intentos Junio 2026 en la laptop (13:16–13:21 hora Lima).
Railway HTTP solicitudes de ZIP 200 con duración prolongada. Railway runtime 13:18 Perú: Error Dropbox 500 en streaming ZIP ya iniciado.
El sistema antiguo insertaba download_logs antes de transmitir ZIP; el cupo se agotaba aunque el ZIP quedara corrupto o cortado.

## Implementación
- Campo status en download_logs, LEGACY para anteriores; nuevos ZIP IN_PROGRESS → COMPLETE si Node terminó escritura de la respuesta, FAILED si falla Dropbox/stream, INTERRUPTED si desconexión anticipada.
- Registro de finished_at, error_code, cuota revertida, fecha/motivo/admin que autorizó. Esquema aditivo SQLite en createDb. No se borran logs antiguos.
- Contador del cupo considera LEGACY, COMPLETE e IN_PROGRESS no restituidos; ignora FAILED/INTERRUPTED y logs con restitución. IN_PROGRESS abandonados por reinicio quedan INTERRUPTED tras 6 horas.
- ZIP de carpeta se genera dinámicamente usando archiver + Dropbox, no admite HTTP Range real. Fallos detectables permiten reintentar el ZIP desde cero SIN cargo por intento fallido.
- Cliente Admin → ficha → historial de descargas, botón restituir intento con motivo validado, doble reembolso prohibido, solo rol ADMIN. Emite trazabilidad.
- Compensación por incidente registrada como migración idempotente: únicamente si +5216123488955 está vinculado a un VIP en vip_allowed_phones.used_user_id Y exactamente dos logs LEGACY/COMPLETE de Junio 2026 entre 2026-10-13T18:15:00Z y 18:23:00Z. Si no coincide, NO se cambia nada; log [JUNE_DOWNLOAD_RESTITUTION_PENDING], revisar ficha del cliente.
- No se prometen bytes reanudables en ZIP generado al vuelo. Para Range real haría falta un ZIP preconstruido/caché persistente con tamaño y offsets estables.

## Pruebas
- test/download-restitution.test.ts: estados, rechazos, cuotas, restitución admin, no doble cargo, migración exacta.
- test/download-stream-outcomes.test.ts: falla Dropbox 500, desconexión anticipada, transmisión exitosa.
- Regressiones invitaciones/clientes.
- Builds API y web.
- Publicar API primero y verificar estado Railway /logs y resultado de restitución. Publicar web después y verificar acceso de Admin, no cambiar CDG.
