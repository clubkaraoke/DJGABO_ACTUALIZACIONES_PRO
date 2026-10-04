import type { ApiErrorDTO } from "@djgabo/shared";

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type TokenGetter = () => string | null;
type RefreshFn = () => Promise<string | null>;

let getAccessToken: TokenGetter = () => null;
let refreshAccessToken: RefreshFn = async () => null;

const rawApiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ?? "";
export const API_BASE_URL = rawApiBase.replace(/\/+$/, "");

export function apiEndpoint(path: string): string {
  const suffix = path.startsWith("/api/") ? path : `/api${path.startsWith("/") ? path : `/${path}`}`;
  return `${API_BASE_URL}${suffix}`;
}

/** El AuthProvider registra aquí cómo leer/renovar el token, sin acoplar este módulo a React. */
export function configureApiClient(getToken: TokenGetter, refresh: RefreshFn): void {
  getAccessToken = getToken;
  refreshAccessToken = refresh;
}

async function request<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
  const token = getAccessToken();
  const hasBody = init.body !== undefined && init.body !== null;

  const res = await fetch(apiEndpoint(path), {
    ...init,
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  if (res.status === 401 && !retried && token) {
    const newToken = await refreshAccessToken();
    if (newToken) return request<T>(path, init, true);
  }

  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const err = body as ApiErrorDTO | null;
    throw new ApiError(
      res.status,
      err?.error ?? "UNKNOWN_ERROR",
      err?.message ?? "Ocurrió un error inesperado",
    );
  }
  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: unknown, extraHeaders?: Record<string, string>) =>
    request<T>(path, {
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: extraHeaders,
    }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "PATCH",
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
};
