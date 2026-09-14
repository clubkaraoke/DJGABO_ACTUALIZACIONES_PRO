import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/authContext";
import { Badge } from "./primitives";

type NavKey = "inicio" | "actualizaciones" | "nuevos" | "historial";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
}

function Icon({ name, className = "h-5 w-5" }: { name: "home" | "sparkles" | "calendar" | "history" | "search" | "logout" | "shield"; className?: string }) {
  const paths: Record<typeof name, ReactNode> = {
    home: <path d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V10.5Z" />,
    sparkles: <><path d="m12 3 1.3 3.7L17 8l-3.7 1.3L12 13l-1.3-3.7L7 8l3.7-1.3L12 3Z" /><path d="m19 14 .8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14Z" /></>,
    calendar: <><path d="M5 3v3M19 3v3M4 8h16" /><rect x="3" y="5" width="18" height="16" rx="2" /></>,
    history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 4v4h4M12 7v5l3 2" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    logout: <><path d="M10 5H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h5" /><path d="m14 8 4 4-4 4M18 12H8" /></>,
    shield: <><path d="M12 3 5 6v5c0 4.6 2.8 8 7 10 4.2-2 7-5.4 7-10V6l-7-3Z" /><path d="m9.5 12 1.8 1.8 3.7-4" /></>,
  };
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{paths[name]}</svg>;
}

const navItems: { key: NavKey; label: string; icon: "home" | "sparkles" | "calendar" | "history"; href: string }[] = [
  { key: "inicio", label: "Inicio", icon: "home", href: "/" },
  { key: "nuevos", label: "Nuevos karaokes", icon: "sparkles", href: "/#nuevos" },
  { key: "actualizaciones", label: "Actualizaciones", icon: "calendar", href: "/#actualizaciones" },
  { key: "historial", label: "Historial", icon: "history", href: "/#historial" },
];

export function ClientPortalShell({
  children,
  active = "inicio",
  searchValue,
  onSearchChange,
  searchPlaceholder = "Buscar actualización...",
}: {
  children: ReactNode;
  active?: NavKey;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;

  const statusTone = user.status === "ACTIVE" ? "accent" : user.status === "SUSPENDED" ? "danger" : "warning";
  const statusLabel = user.status === "ACTIVE" ? "Activo" : user.status === "SUSPENDED" ? "Suspendido" : "Vencido";
  const initials = user.name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "DG";

  return (
    <div className="min-h-screen bg-carbon text-ink">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-graphite-border bg-[#090a0b] lg:flex">
        <Link to="/" className="flex h-20 items-center gap-3 border-b border-graphite-border px-5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent font-display text-sm font-extrabold text-carbon">DG</span>
          <span className="leading-tight">
            <span className="block font-display text-sm font-extrabold tracking-tight text-ink">DJGABO</span>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.22em] text-accent">Actualizaciones Pro</span>
          </span>
        </Link>

        <nav className="space-y-1 px-3 py-5">
          {navItems.map((item) => {
            const activeItem = active === item.key;
            return (
              <a key={item.key} href={item.href} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${activeItem ? "bg-accent-soft text-accent" : "text-ink-secondary hover:bg-graphite hover:text-ink"}`}>
                <Icon name={item.icon} className="h-4.5 w-4.5" />
                {item.label}
              </a>
            );
          })}
        </nav>

        <div className="mx-4 mt-2 rounded-xl border border-accent/20 bg-gradient-to-br from-accent/10 to-transparent p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-accent">Tu membresía</span>
            <Icon name="shield" className="h-4 w-4 text-accent" />
          </div>
          <p className="font-display text-sm font-bold text-ink">{user.plan?.name ?? "Sin plan"}</p>
          <p className="mt-1 text-xs text-ink-secondary">Vence {formatDate(user.subscriptionEnd)}</p>
          <div className="mt-3 flex items-center justify-between text-xs">
            <span className="text-ink-secondary">Dispositivos</span>
            <span className="font-semibold text-ink">{user.devicesUsed}/{user.maxDevices}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-graphite-elevated">
            <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, user.maxDevices ? (user.devicesUsed / user.maxDevices) * 100 : 0)}%` }} />
          </div>
          <div className="mt-3"><Badge tone={statusTone}>{statusLabel}</Badge></div>
        </div>

        <div className="mt-auto border-t border-graphite-border p-3">
          {user.role === "ADMIN" && (
            <button onClick={() => navigate("/admin")} className="mb-1 w-full rounded-lg px-3 py-2 text-left text-sm text-ink-secondary hover:bg-graphite hover:text-ink">Panel administrador</button>
          )}
          <button onClick={() => logout()} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-secondary hover:bg-graphite hover:text-ink">
            <Icon name="logout" className="h-4 w-4" /> Salir
          </button>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-graphite-border bg-carbon/95 backdrop-blur-xl">
          <div className="flex min-h-20 items-center gap-3 px-4 sm:px-6 lg:px-8">
            <Link to="/" className="flex items-center gap-2 lg:hidden">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent font-display text-xs font-extrabold text-carbon">DG</span>
            </Link>
            <div className="relative max-w-2xl flex-1">
              <Icon name="search" className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-tertiary" />
              <input
                value={searchValue ?? ""}
                onChange={(e) => onSearchChange?.(e.target.value)}
                readOnly={!onSearchChange}
                placeholder={searchPlaceholder}
                className="w-full rounded-xl border border-graphite-border bg-graphite/80 py-3 pl-10 pr-4 text-sm text-ink placeholder:text-ink-tertiary focus:border-accent/50 focus:outline-none"
              />
            </div>
            <div className="hidden items-center gap-3 sm:flex">
              <div className="text-right">
                <p className="text-sm font-semibold text-ink">{user.name}</p>
                <p className="text-xs text-ink-tertiary">{user.plan?.name ?? "Sin plan"}</p>
              </div>
              <span className="flex h-10 w-10 items-center justify-center rounded-full border border-accent/30 bg-accent-soft text-xs font-bold text-accent">{initials}</span>
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto border-t border-graphite-border px-4 py-2 lg:hidden">
            {navItems.map((item) => <a key={item.key} href={item.href} className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium ${active === item.key ? "bg-accent text-carbon" : "bg-graphite text-ink-secondary"}`}>{item.label}</a>)}
          </div>
        </header>
        <main className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
