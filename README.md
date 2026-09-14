# DJGABO ACTUALIZACIONES PRO

Portal privado de distribución de actualizaciones de karaoke para clientes/suscriptores de KIT KARAOKE / DJGABO.

No es una tienda, ni un Netflix, ni un Dropbox personal: es un panel de suscripción donde cada cliente ve únicamente las colecciones mensuales de karaoke a las que tiene acceso, puede previsualizar y descargar karaokes individuales, o descargar la colección completa.

## Estado del proyecto

Funcional de punta a punta con **`MockStorageProvider`** (sin Dropbox conectado). Ver `docs/DEPLOYMENT_NOTES.md` → sección "Estado final" para el detalle exacto de qué está verificado y qué no.

## Stack

- **Frontend**: React + TypeScript + Vite + React Router + TanStack Query + Tailwind CSS (sin librería de componentes genérica)
- **Backend**: Node.js + TypeScript + Fastify
- **Base de datos**: SQLite en desarrollo vía **Drizzle ORM** (no Prisma — ver nota abajo), migrable a Postgres
- **Testing**: Vitest + Testing Library

> **Nota sobre el ORM**: el brief original pedía Prisma. Prisma requiere descargar
> un motor binario desde `binaries.prisma.sh` en tiempo de `prisma generate`;
> ese dominio no estaba disponible en el entorno donde se construyó este
> proyecto, así que se optó por **Drizzle ORM + better-sqlite3** (100%
> JS/TS, sin binario externo que descargar). La arquitectura de dominio
> (`packages/domain`, `packages/storage`) es independiente del ORM por
> diseño, así que este cambio no afectó las reglas de negocio. Ver
> `docs/ARCHITECTURE.md`.

## Estructura del repositorio

```
DJGABO_ACTUALIZACIONES_PRO/
├── apps/
│   ├── web/            # Frontend React
│   └── api/            # Backend Fastify + Drizzle
├── packages/
│   ├── shared/         # Tipos/DTOs compartidos
│   ├── domain/         # AuthorizationService (reglas de negocio puras)
│   └── storage/        # StorageProvider (Mock/Dropbox) + indexador
├── docs/
├── docker-compose.yml
├── .env.example
└── README.md
```

## Puesta en marcha (sin Docker — vía verificada)

Requiere Node.js 22+.

```bash
git clone <tu-repo>   # o descomprime el .zip entregado
cd DJGABO_ACTUALIZACIONES_PRO
npm install

# Configura el API
cp .env.example apps/api/.env
# (los valores por defecto ya funcionan para desarrollo local)

# Base de datos: crea el schema SQLite y siembra datos demo
npm run db:migrate --workspace=apps/api
npm run db:seed --workspace=apps/api

# Levanta API + Web
npm run dev
```

- API: http://localhost:4000
- Web: http://localhost:5173

## Puesta en marcha con Docker

```bash
docker compose up --build -d
# primera vez únicamente: crear el schema y sembrar datos
docker compose exec api npx drizzle-kit push
docker compose exec api npx tsx seed/seed.ts
```

- API: http://localhost:4000
- Web: http://localhost:8080

Esto levanta la API sobre **SQLite** (igual que sin Docker). El
`docker-compose.yml` también incluye un servicio `postgres` bajo el perfil
`postgres`, pero **no está conectado a la app todavía** — es solo un
contenedor de referencia para una futura migración (ver
`docs/STORAGE.md`). No lo actives esperando que la API lo use: hoy no
tendría ningún efecto.

**No se pudo probar `docker compose up` dentro del sandbox donde se construyó
este proyecto** (no había daemon de Docker disponible). Los Dockerfiles son
correctos en su estructura pero pruébalos en tu máquina antes de depender de
ellos — ver `docs/DEPLOYMENT_NOTES.md`.

## Credenciales demo

| Rol | Email | Contraseña | Notas |
|---|---|---|---|
| Admin | admin@djgabo.com | Djgabo2026! | Acceso total al panel `/admin` |
| Cliente | carlos@demo.com | Djgabo2026! | PRO ANUAL, acceso a los últimos 6 meses |
| Cliente | maria@demo.com | Djgabo2026! | BÁSICO, solo el mes más reciente |
| Cliente | jose@demo.com | Djgabo2026! | Suspendido (demuestra el bloqueo de login) |
| Cliente | ana@demo.com | Djgabo2026! | Vencida por fecha aunque su status diga ACTIVE |
| Cliente | luis@demo.com | Djgabo2026! | Acceso total, 2/2 dispositivos (demuestra el límite) |

## Probar el flujo completo

**Cliente**: login con `carlos@demo.com` → "Mis actualizaciones" (verás meses bloqueados 🔒 y permitidos ✅) → abre "Septiembre 2026" → busca un karaoke → preview → descarga individual → "Descargar todo" (verás la barra de progreso).

**Admin**: login con `admin@djgabo.com` → Dashboard → Clientes (gestiona estado/plan/dispositivos/accesos de cualquier cliente) → Colecciones → **Sincronización** → pulsa "Analizar" (verás 6 archivos nuevos detectados en modo DRY RUN, sin escribir nada) → pulsa "Sincronizar" (crea de verdad la colección "Octubre 2026" con esos 6 karaokes — es el mismo ejemplo del brief original).

## Conectar Dropbox

Ver `docs/DROPBOX_SETUP.md` para la guía paso a paso. En resumen:

1. Crea la app en Dropbox y obtén `APP_KEY`, `APP_SECRET`, `REFRESH_TOKEN`.
2. Ponlos en `apps/api/.env` junto con `DROPBOX_ROOT_PATH`.
3. Cambia `STORAGE_PROVIDER=dropbox`.
4. Reinicia el API y ejecuta la sincronización desde `/admin/sincronizacion`.

**No hay que tocar ni un componente de React** para este cambio — ver `docs/ARCHITECTURE.md`.

## Otros documentos

- `docs/ARCHITECTURE.md` — arquitectura completa, capas y por qué
- `docs/AUTHORIZATION.md` — reglas de acceso/descarga/preview
- `docs/STORAGE.md` — StorageProvider, migración a Postgres
- `docs/DROPBOX_SETUP.md` — guía de conexión a Dropbox
- `docs/DEPLOYMENT_NOTES.md` — checkpoint final, limitaciones, próximos pasos (**solo guía, nada desplegado**)
