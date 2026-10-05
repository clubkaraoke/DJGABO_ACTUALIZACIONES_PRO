import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  BarChart3,
  CircleDollarSign,
  Database,
  Download,
  ListMusic,
  LogOut,
  Menu,
  RefreshCw,
  SlidersHorizontal,
  Users,
  X,
  ClipboardList,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "../lib/authContext";

const NAV_ITEMS = [
  { to: "/admin", label: "Dashboard", icon: BarChart3, end: true },
  { to: "/admin/clientes", label: "Clientes", icon: Users },
  { to: "/admin/pedidos", label: "Pedidos", icon: ClipboardList },
  { to: "/admin/planes", label: "Planes", icon: CircleDollarSign },
  { to: "/admin/colecciones", label: "Colecciones", icon: Database },
  { to: "/admin/karaokes", label: "Karaokes", icon: ListMusic },
  { to: "/admin/descargas", label: "Descargas", icon: Download },
  { to: "/admin/reproductor", label: "Reproductor CDG", icon: SlidersHorizontal },
  { to: "/admin/sincronizacion", label: "Sincronización", icon: RefreshCw },
];

export function AdminShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {open && (
        <button
          aria-label="Cerrar menú"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-black/70 md:hidden"
        />
      )}

      <aside
        className={
          "fixed inset-y-0 left-0 z-40 flex w-[255px] flex-col border-r border-white/[0.06] bg-sidebar transition-transform duration-150 md:translate-x-0 " +
          (open ? "translate-x-0" : "-translate-x-full")
        }
      >
        <div className="flex h-16 shrink-0 items-center border-b border-white/[0.06] px-5">
          <button onClick={() => navigate("/admin")} className="flex min-w-0 items-center gap-2.5 text-left">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-black text-black">D</span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[13px] font-bold tracking-tight">
                DJGABO <span className="text-primary">ADMIN</span>
              </span>
              <span className="block font-mono text-[9px] tracking-[0.18em] text-muted-foreground">
                ACTUALIZACIONES PRO
              </span>
            </span>
          </button>
          <button onClick={() => setOpen(false)} className="ml-auto text-muted-foreground md:hidden">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                "flex items-center gap-3 rounded-md px-3 py-2 text-[13px] font-medium transition-colors " +
                (isActive
                  ? "bg-primary/[0.12] text-primary"
                  : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground")
              }
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-white/[0.06] p-3">
          <div className="rounded-lg border border-white/[0.06] bg-secondary p-3.5">
            <p className="truncate text-[12px] font-semibold text-foreground">{user?.name || "Administrador"}</p>
            <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{user?.email}</p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => navigate("/panel")}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-white/[0.08] px-2 py-1.5 text-[10px] font-semibold text-ink-secondary hover:bg-white/[0.04] hover:text-foreground"
              >
                <ArrowLeft className="h-3 w-3" /> Portal
              </button>
              <button
                onClick={() => logout()}
                className="inline-flex items-center justify-center rounded-md border border-white/[0.08] px-2.5 py-1.5 text-ink-tertiary hover:bg-white/[0.04] hover:text-foreground"
                aria-label="Salir"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      <div className="md:pl-[255px]">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-white/[0.06] bg-background/85 px-4 backdrop-blur-xl md:px-8">
          <button onClick={() => setOpen(true)} className="text-muted-foreground md:hidden">
            <Menu className="h-5 w-5" />
          </button>
          <div>
            <p className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-primary">DJGABO ADMIN</p>
            <p className="text-[12px] text-muted-foreground">Gestión de Actualizaciones PRO</p>
          </div>
          <button
            onClick={() => navigate("/panel")}
            className="ml-auto hidden items-center gap-1.5 rounded-full border border-white/[0.08] px-3 py-1.5 text-[11px] font-semibold text-ink-secondary hover:bg-white/[0.04] hover:text-foreground sm:inline-flex"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Ver portal cliente
          </button>
        </header>

        <main className="mx-auto max-w-[1600px] px-4 py-5 md:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
