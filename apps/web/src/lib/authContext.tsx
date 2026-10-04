import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { LoginResponseDTO, MeDTO } from "@djgabo/shared";
import { api, ApiError, apiEndpoint, configureApiClient } from "./apiClient";

const REFRESH_TOKEN_KEY = "djgabo.refreshToken";

interface AuthContextValue {
  user: MeDTO | null;
  loading: boolean;
  loginError: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<MeDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [loginError, setLoginError] = useState<string | null>(null);

  const doRefresh = useCallback(async (): Promise<string | null> => {
    const stored = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!stored) return null;
    try {
      const res = await fetch(apiEndpoint("/auth/refresh"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: stored }),
      });
      if (!res.ok) {
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        return null;
      }
      const data = (await res.json()) as { accessToken: string; refreshToken: string };
      localStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
      setAccessToken(data.accessToken);
      return data.accessToken;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    configureApiClient(() => accessToken, doRefresh);
  }, [accessToken, doRefresh]);

  const loadMe = useCallback(async () => {
    try {
      const me = await api.get<MeDTO>("/auth/me");
      setUser(me);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const token = await doRefresh();
      if (token) await loadMe();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    setLoginError(null);
    try {
      const res = await fetch(apiEndpoint("/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json();
      if (!res.ok) {
        setLoginError(body.message ?? "No se pudo iniciar sesión");
        return false;
      }
      const data = body as LoginResponseDTO;
      localStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
      setAccessToken(data.accessToken);
      setUser(data.user);
      return true;
    } catch {
      setLoginError("No se pudo conectar con el servidor");
      return false;
    }
  }, []);

  const logout = useCallback(async () => {
    const stored = localStorage.getItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    setAccessToken(null);
    setUser(null);
    if (stored) {
      try {
        await fetch(apiEndpoint("/auth/logout"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: stored }),
        });
      } catch {
        // El logout local ya ocurrió; si la red falla, no bloqueamos al usuario.
      }
    }
  }, []);

  const refreshMe = useCallback(async () => {
    await loadMe();
  }, [loadMe]);

  const value = useMemo(
    () => ({ user, loading, loginError, login, logout, refreshMe }),
    [user, loading, loginError, login, logout, refreshMe],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}
