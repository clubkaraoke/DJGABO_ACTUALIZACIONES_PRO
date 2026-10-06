import { useState, type FormEvent, type ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { Crown, FolderOpen, Home, LogIn, Menu, Package, Search, Shield, Sparkles, X } from "lucide-react";
import { useAuth } from "../lib/authContext";

const nav = [
  { to: "/panel", label: "Inicio", icon: Home, end: true },
  { to: "/panel/actualizaciones", label: "Actualizaciones", icon: FolderOpen },
  { to: "/panel/paquetes", label: "Paquetes", icon: Package },
  { to: "/panel/a-pedido", label: "A pedido", icon: Sparkles },
];

export function VipShell({ children, searchValue = "", onSearchChange, searchPlaceholder = "Buscar karaokes..." }: {
  children: ReactNode;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [localSearch, setLocalSearch] = useState("");
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const displayedSearch = onSearchChange ? searchValue : localSearch;
  const submitSearch = (e: FormEvent) => {
    e.preventDefault();
    const value = displayedSearch.trim();
    if (value && !onSearchChange) navigate(`/panel/buscar?q=${encodeURIComponent(value)}`);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {open && <button aria-label="Cerrar menú" onClick={() => setOpen(false)} className="fixed inset-0 z-30 bg-black/70 md:hidden" />}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[255px] flex-col border-r border-white/[0.06] bg-sidebar transition-transform duration-150 md:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-16 shrink-0 items-center border-b border-white/[0.06] px-5">
          <Link to="/panel" className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-black text-black">D</span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[13px] font-bold tracking-tight">DJGABO</span>
              <span className="block font-mono text-[10px] tracking-[0.18em] text-muted-foreground">KARAOKE VIP</span>
            </span>
          </Link>
          <button onClick={() => setOpen(false)} className="ml-auto text-muted-foreground md:hidden"><X className="h-5 w-5" /></button>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
          {nav.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} onClick={() => setOpen(false)} className={({ isActive }) => `flex items-center gap-3 rounded-md px-3 py-2 text-[13px] font-medium transition-colors ${isActive ? "bg-primary/[0.12] text-primary" : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"}`}>
              <item.icon className="h-4 w-4 shrink-0" />{item.label}
            </NavLink>
          ))}

          {user?.role === "ADMIN" ? (
            <NavLink to="/admin" onClick={() => setOpen(false)} className={({ isActive }) => `mt-1.5 flex items-center gap-3 rounded-md px-3 py-2 text-[13px] font-medium ${isActive ? "bg-primary/[0.12] text-primary" : "text-primary/80 hover:bg-primary/[0.06] hover:text-primary"}`}>
              <Shield className="h-4 w-4" />Panel Admin
            </NavLink>
          ) : !user ? (
            <NavLink to="/login" onClick={() => setOpen(false)} className="mt-1.5 flex items-center gap-3 rounded-md px-3 py-2 text-[13px] font-medium text-primary/90 hover:bg-primary/[0.06] hover:text-primary">
              <LogIn className="h-4 w-4" />Acceso VIP
            </NavLink>
          ) : null}
        </nav>

        <div className="p-3">
          <div className="rounded-lg border border-white/[0.06] bg-secondary p-3.5">
            <div className="mb-1.5 inline-flex items-center gap-1.5 font-mono text-[10px] font-bold tracking-wider text-primary"><Crown className="h-3 w-3" /> MEMBRESÍA VIP</div>
            <div className="mb-1 text-[13px] font-semibold">{user?.plan?.name ?? (user ? "Acceso VIP" : "Explora gratis")}</div>
            <p className="mb-2.5 text-[11px] leading-relaxed text-muted-foreground">
              {user
                ? "Accede a tus colecciones, paquetes y nuevos lanzamientos DJGABO."
                : "Mira todo el catálogo y escucha demos. Inicia sesión o elige un plan para descargar."}
            </p>
            {!user && (
              <button onClick={() => navigate("/login")} className="mb-2 w-full rounded-md border border-primary/30 py-1.5 text-[12px] font-semibold text-primary hover:bg-primary/[0.06]">
                Acceso VIP
              </button>
            )}
            <button onClick={() => navigate("/planes")} className="w-full rounded-md bg-primary py-1.5 text-[12px] font-semibold text-black hover:brightness-95">Planes y Precios</button>
          </div>
        </div>
      </aside>

      <div className="md:pl-[255px]">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-white/[0.06] bg-background/85 px-4 backdrop-blur-xl md:px-8">
          <button onClick={() => setOpen(true)} className="text-muted-foreground md:hidden"><Menu className="h-5 w-5" /></button>
          <form onSubmit={submitSearch} className="relative max-w-[480px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={displayedSearch} onChange={(e) => onSearchChange ? onSearchChange(e.target.value) : setLocalSearch(e.target.value)} placeholder={searchPlaceholder} className="h-[38px] w-full rounded-full border border-white/[0.06] bg-secondary pl-10 pr-4 text-[13px] placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none" />
          </form>

          <button onClick={() => navigate("/planes")} className="ml-auto hidden items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-[13px] font-semibold text-black hover:brightness-95 sm:inline-flex"><Crown className="h-4 w-4" /> Planes y Precios</button>

          {user ? (
            <>
              <div className="hidden max-w-[150px] truncate text-[12px] text-muted-foreground lg:block">{user.name || user.email}</div>
              <button onClick={() => logout()} className="text-[13px] text-muted-foreground hover:text-foreground">Salir</button>
            </>
          ) : (
            <button onClick={() => navigate("/login")} className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.10] px-3 py-2 text-[12px] font-semibold text-foreground hover:bg-white/[0.04]">
              <LogIn className="h-3.5 w-3.5" /> Acceso VIP
            </button>
          )}
        </header>
        <main className="mx-auto max-w-[1600px] px-4 py-5 md:px-6">{children}</main>
      </div>
    </div>
  );
}
