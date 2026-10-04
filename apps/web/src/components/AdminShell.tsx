import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../lib/authContext";

const NAV_ITEMS = [
  { to: "/admin", label: "Dashboard", end: true },
  { to: "/admin/clientes", label: "Clientes" },
  { to: "/admin/planes", label: "Planes" },
  { to: "/admin/colecciones", label: "Colecciones" },
  { to: "/admin/karaokes", label: "Karaokes" },
  { to: "/admin/descargas", label: "Descargas" },
  { to: "/admin/reproductor", label: "Reproductor CDG" },
  { to: "/admin/sincronizacion", label: "Sincronización" },
];

export function AdminShell() {
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-screen bg-carbon">
      <aside className="hidden w-56 shrink-0 border-r border-graphite-border bg-graphite/60 sm:block">
        <div className="p-5">
          <p className="font-display text-sm font-bold text-ink">
            DJGABO <span className="text-accent">ADMIN</span>
          </p>
        </div>
        <nav className="flex flex-col gap-0.5 px-3">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? "bg-accent-soft text-accent" : "text-ink-secondary hover:bg-graphite-elevated hover:text-ink"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="absolute bottom-0 w-56 border-t border-graphite-border p-4">
          <p className="truncate text-xs text-ink-secondary">{user?.name}</p>
          <div className="mt-2 flex gap-2">
            <NavLink to="/" className="text-xs text-ink-tertiary hover:text-ink">
              Ver portal cliente
            </NavLink>
            <button onClick={() => logout()} className="text-xs text-ink-tertiary hover:text-ink">
              Salir
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 overflow-x-hidden">
        {/* nav móvil simple */}
        <div className="flex gap-2 overflow-x-auto border-b border-graphite-border bg-graphite/60 px-3 py-2 sm:hidden">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `shrink-0 rounded-md px-3 py-1.5 text-xs font-medium ${isActive ? "bg-accent-soft text-accent" : "text-ink-secondary"}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </div>
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
