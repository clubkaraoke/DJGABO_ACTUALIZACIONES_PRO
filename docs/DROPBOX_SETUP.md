# Conectar Dropbox — DJGABO ACTUALIZACIONES PRO

Esta guía asume que ya tienes el proyecto corriendo con `STORAGE_PROVIDER=mock`
(ver README). Conectar Dropbox **no requiere tocar ni un componente de
React ni la lógica de descargas** — solo variables de entorno.

## 1. Crear la app en Dropbox

1. Ve a https://www.dropbox.com/developers/apps y pulsa "Create app".
2. Elige:
   - **Scoped access**
   - **Full Dropbox** (o "App folder" si prefieres aislar los archivos de
     DJGABO en una carpeta dedicada — en ese caso ajusta `DROPBOX_ROOT_PATH`
     más abajo a esa carpeta).
   - Ponle un nombre, por ejemplo `djgabo-actualizaciones-pro`.

## 2. Configurar los permisos (scopes)

En la pestaña **Permissions** de tu app, activa **solo** estos dos scopes —
es todo lo que el código de `DropboxStorageProvider` necesita para su
operación de solo lectura (nunca escribe, comparte ni borra nada en tu
Dropbox):

- `files.metadata.read` — usado por `/files/get_metadata` y
  `/files/list_folder` (+ `/files/list_folder/continue`) para listar
  carpetas y verificar existencia.
- `files.content.read` — usado por `/files/get_temporary_link` para generar
  los links temporales de descarga/preview.

**No actives `sharing.write` ni ningún otro scope.** No hay ningún código en
este proyecto que llame a un endpoint de `/sharing/*` — ese scope no se usa
para nada aquí y, siguiendo el principio de mínimo privilegio, no debe
concedérsele a la app. Si en el futuro se agrega una función que sí lo
necesite (por ejemplo, crear links compartidos en vez de temporales), el
scope correspondiente debe pedirse en ese momento, no por adelantado.

Guarda los cambios ("Submit").

## 3. Obtener las credenciales

En la pestaña **Settings**:

- Copia el **App key** → `DROPBOX_APP_KEY`
- Copia el **App secret** → `DROPBOX_APP_SECRET`

### Obtener el refresh token

El refresh token no expira (a diferencia del access token, que dura pocas
horas), así que es lo que el servidor guarda de forma permanente.

1. Construye esta URL reemplazando `<APP_KEY>` por tu App key, y ábrela en
   el navegador:

   ```
   https://www.dropbox.com/oauth2/authorize?client_id=<APP_KEY>&response_type=code&token_access_type=offline
   ```

2. Autoriza la app. Dropbox te mostrará un **código de autorización**.
3. Cámbialo por un refresh token con este comando (reemplaza los 3
   valores):

   ```bash
   curl https://api.dropboxapi.com/oauth2/token \
     -d code=<CODIGO_DEL_PASO_2> \
     -d grant_type=authorization_code \
     -d client_id=<APP_KEY> \
     -d client_secret=<APP_SECRET>
   ```

4. La respuesta incluye `"refresh_token": "..."` → cópialo a
   `DROPBOX_REFRESH_TOKEN`.

## 4. Configurar las variables de entorno

En `apps/api/.env`:

```bash
STORAGE_PROVIDER=dropbox
DROPBOX_APP_KEY=tu_app_key
DROPBOX_APP_SECRET=tu_app_secret
DROPBOX_REFRESH_TOKEN=el_refresh_token_del_paso_3
DROPBOX_ROOT_PATH=/ACTUALIZACIONES
```

`DROPBOX_ROOT_PATH` debe apuntar a la carpeta de Dropbox donde subes las
actualizaciones, organizadas así (el `StorageIndexerService` espera
exactamente esta estructura):

```
/ACTUALIZACIONES/
    /2026/
        /09 SEPTIEMBRE/
            GRUPO 5 - MOTOR Y MOTIVO.mp4
            ARMONIA 10 - EL AMOR MAS BONITO.mp4
        /10 OCTUBRE/
            ...
```

## 5. Verificar la conexión

1. Reinicia el API (`npm run dev --workspace=apps/api`).
2. En los logs deberías ver: `Storage provider activo: dropbox (...)`.
   Si en vez de eso ves `mock`, revisa que las 3 variables
   (`DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET`, `DROPBOX_REFRESH_TOKEN`) estén
   completas — el sistema cae a Mock automáticamente si falta alguna, para
   no romper el arranque.
3. Entra a `/admin/sincronizacion` y pulsa **Analizar**. Deberías ver los
   archivos reales de tu carpeta de Dropbox listados como "nuevos".
4. Pulsa **Sincronizar** para crear las colecciones/karaokes de verdad.

## 6. Volver a Mock en cualquier momento

Cambia `STORAGE_PROVIDER=mock` (o bórralo) y reinicia el API. Nada más se
rompe: los datos ya sincronizados desde Dropbox se quedan en la base de
datos, solo que las URLs temporales volverán a ser simuladas hasta que
reactives Dropbox.

## Notas importantes

- El adaptador (`DropboxStorageProvider`) **no fue probado contra la API
  real de Dropbox** — se construyó en un entorno sin acceso de red a
  `api.dropboxapi.com`. Está implementado siguiendo exactamente la
  documentación pública de la API v2 (OAuth2 refresh token, paginación por
  cursor, manejo de 429), pero verifica el primer "Analizar" con cuidado.
- Los links temporales de Dropbox (`/files/get_temporary_link`) duran
  aproximadamente 4 horas según la documentación pública de Dropbox, pero
  esa duración **no la controla ni la conoce con exactitud nuestra app**:
  el endpoint no acepta un TTL configurable ni lo informa en su respuesta.
  Por eso `StorageService` devuelve `expiresAt: null` para cualquier
  provider que no sea Mock, en vez de inventar una fecha — ver
  `docs/STORAGE.md`. No hay ningún ajuste de TTL que hacer para Dropbox.
- Nunca subas tu `.env` con credenciales reales a git — ya está en
  `.gitignore`.
