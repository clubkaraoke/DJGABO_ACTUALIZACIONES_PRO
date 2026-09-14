import { useState, type FormEvent } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../lib/authContext";
import { Button } from "../components/primitives";

export default function LoginPage() {
  const { user, login, loginError } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (user) {
    const from = (location.state as { from?: Location })?.from?.pathname;
    return <Navigate to={from ?? "/"} replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    await login(email, password);
    setSubmitting(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-carbon px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-display text-2xl font-bold text-ink">
            DJGABO <span className="text-accent">ACTUALIZACIONES PRO</span>
          </h1>
          <p className="mt-2 text-sm text-ink-secondary">Portal privado de distribución de actualizaciones</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-graphite-border bg-graphite p-6 shadow-card">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-ink-secondary">
              Correo electrónico
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-graphite-border bg-graphite-elevated px-3 py-2.5 text-sm text-ink outline-none focus:border-accent"
              placeholder="tu@correo.com"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-ink-secondary">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-graphite-border bg-graphite-elevated px-3 py-2.5 text-sm text-ink outline-none focus:border-accent"
              placeholder="••••••••"
            />
          </div>

          {loginError && (
            <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
              {loginError}
            </p>
          )}

          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "Ingresando..." : "Ingresar"}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-ink-tertiary">
          Cuentas demo: carlos@demo.com · maria@demo.com · admin@djgabo.com — contraseña Djgabo2026!
        </p>
      </div>
    </div>
  );
}
