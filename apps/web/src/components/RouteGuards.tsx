import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/authContext";
import { Spinner } from "./primitives";

export function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-carbon text-accent">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return <Outlet />;
}

/**
 * Un MEMBER nunca ve el panel admin, ni siquiera escribiendo la URL: esta
 * verificación en el cliente es solo UX. La protección real vive en el
 * backend (fastify.requireRole en cada ruta /api/admin/*).
 */
export function RequireAdmin() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-carbon text-accent">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "ADMIN") return <Navigate to="/" replace />;
  return <Outlet />;
}
