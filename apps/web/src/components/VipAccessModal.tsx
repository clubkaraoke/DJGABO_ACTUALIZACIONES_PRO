import { Crown, LockKeyhole, X } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function VipAccessModal({
  onClose,
  loggedIn = false,
  message,
}: {
  onClose: () => void;
  loggedIn?: boolean;
  message?: string;
}) {
  const navigate = useNavigate();

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="w-full max-w-[430px] rounded-[14px] border border-white/[0.08] bg-card p-5 shadow-2xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <LockKeyhole className="h-5 w-5" />
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-white/[0.05] hover:text-foreground" aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <h2 className="mt-4 text-xl font-black text-foreground">
          {loggedIn ? "Tu plan necesita acceso" : "Acceso VIP requerido"}
        </h2>
        <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
          {message ??
            (loggedIn
              ? "Este contenido no está incluido en tu acceso actual. Revisa los planes disponibles para habilitar la descarga."
              : "Puedes explorar todo el catálogo y reproducir los demos disponibles. Para descargar necesitas iniciar sesión con una cuenta VIP o contratar un plan.")}
        </p>

        <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
          {!loggedIn && (
            <button
              onClick={() => navigate("/login", { state: { from: window.location.pathname + window.location.search } })}
              className="rounded-md border border-white/[0.10] px-4 py-2.5 text-[13px] font-semibold text-foreground hover:bg-white/[0.04]"
            >
              Acceso VIP
            </button>
          )}
          <button
            onClick={() => navigate("/planes")}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-[13px] font-bold text-black hover:brightness-95"
          >
            <Crown className="h-4 w-4" />
            Ver planes
          </button>
        </div>
      </div>
    </div>
  );
}
