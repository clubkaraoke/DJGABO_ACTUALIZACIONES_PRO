import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/authContext";
import { Badge } from "./primitives";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
}

export function ClientHeader() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  const statusTone = user.status === "ACTIVE" ? "accent" : user.status === "SUSPENDED" ? "danger" : "warning";
  const statusLabel = user.status === "ACTIVE" ? "Activo" : user.status === "SUSPENDED" ? "Suspendido" : "Vencido";

  return (
    <header className="sticky top-0 z-20 border-b border-graphite-border bg-carbon/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2">
          <span className="font-display text-lg font-bold tracking-tight text-ink">
            DJGABO <span className="text-accent">ACTUALIZACIONES PRO</span>
          </span>
        </Link>

        <div className="flex items-center gap-3 text-sm">
          <div className="hidden flex-col items-end sm:flex">
            <span className="font-medium text-ink">{user.name}</span>
            <span className="text-xs text-ink-secondary">
              {user.plan?.name ?? "Sin plan"} · vence {formatDate(user.subscriptionEnd)} · {user.devicesUsed}/{user.maxDevices} dispositivos
            </span>
          </div>
          <Badge tone={statusTone}>{statusLabel}</Badge>
          {user.role === "ADMIN" && (
            <button
              onClick={() => navigate("/admin")}
              className="rounded-md border border-graphite-border px-3 py-1.5 text-xs font-medium text-ink-secondary hover:text-ink"
            >
              Panel admin
            </button>
          )}
          <button
            onClick={() => logout()}
            className="rounded-md border border-graphite-border px-3 py-1.5 text-xs font-medium text-ink-secondary hover:text-ink"
          >
            Salir
          </button>
        </div>
      </div>
    </header>
  );
}
