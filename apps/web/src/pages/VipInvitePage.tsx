import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, Crown, Loader2, Lock, Mail, MessageCircle } from "lucide-react";
import { apiEndpoint } from "../lib/apiClient";
import { useAuth } from "../lib/authContext";

export default function VipInvitePage() {
  const { inviteCode = "" } = useParams<{ inviteCode: string }>();
  const navigate = useNavigate();
  const { user, vipInviteRegister } = useAuth();
  const [validating, setValidating] = useState(true);
  const [valid, setValid] = useState(false);
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(apiEndpoint(`/auth/vip-invite/${encodeURIComponent(inviteCode)}/validate`));
        if (active) setValid(res.ok);
      } catch {
        if (active) setValid(false);
      } finally {
        if (active) setValidating(false);
      }
    })();
    return () => { active = false; };
  }, [inviteCode]);

  if (user) return <Navigate to="/panel" replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    const result = await vipInviteRegister(inviteCode, email.trim(), whatsapp.trim(), password);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message ?? "No se pudo completar el registro");
      return;
    }
    navigate("/panel", { replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8 text-foreground">
      <div className="w-full max-w-[430px]">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-black">
            <Crown className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-black">Registro <span className="text-primary">VIP DJGABO</span></h1>
          <p className="mt-2 text-[13px] leading-5 text-muted-foreground">
            Acceso exclusivo para clientes VIP existentes.
          </p>
        </div>

        {validating ? (
          <div className="flex justify-center rounded-[10px] border border-white/[0.06] bg-card py-14">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : !valid ? (
          <div className="rounded-[10px] border border-white/[0.06] bg-card p-6 text-center">
            <p className="text-sm font-semibold">Este enlace de invitación no es válido.</p>
            <button onClick={() => navigate("/panel")} className="mt-4 text-[13px] font-semibold text-primary hover:underline">
              Ir al catálogo
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4 rounded-[10px] border border-white/[0.06] bg-card p-6 shadow-card">
            <div className="mb-1 flex items-center gap-2 rounded-md border border-emerald-400/20 bg-emerald-400/[0.07] px-3 py-2 text-[11px] text-emerald-300">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Tu invitación VIP está habilitada.
            </div>

            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-muted-foreground">E-mail</span>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@correo.com" className="h-11 w-full rounded-md border border-white/[0.08] bg-secondary pl-10 pr-3 text-[13px] outline-none focus:border-primary/50" />
              </div>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-muted-foreground">WhatsApp de contacto</span>
              <div className="relative">
                <MessageCircle className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input type="tel" required value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="Ej. 51987654321" className="h-11 w-full rounded-md border border-white/[0.08] bg-secondary pl-10 pr-3 text-[13px] outline-none focus:border-primary/50" />
              </div>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-muted-foreground">Crea tu contraseña</span>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres" className="h-11 w-full rounded-md border border-white/[0.08] bg-secondary pl-10 pr-3 text-[13px] outline-none focus:border-primary/50" />
              </div>
            </label>

            {error && <p className="rounded-md bg-danger/10 px-3 py-2 text-[12px] text-danger">{error}</p>}

            <button disabled={submitting} className="flex h-11 w-full items-center justify-center rounded-md bg-primary text-[13px] font-bold text-black hover:brightness-95 disabled:opacity-50">
              {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Registrando...</> : "Registrarme"}
            </button>

            <p className="text-center text-[10px] leading-4 text-muted-foreground">
              Después de registrarte podrás entrar al panel y solicitar la activación de tu membresía por WhatsApp.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
