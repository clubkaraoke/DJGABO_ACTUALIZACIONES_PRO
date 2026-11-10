/**
 * DJGABO Actualizaciones — LAB Cloudflare, solo lectura.
 * El único contenido público son los documentos JSON que ya servía Railway
 * mediante /api/catalog/... No expone tablas privadas, storageKey ni tokens.
 * Autenticación y descargas comerciales siguen DESACTIVADAS.
 */
import { handleLabAuth, type LabEnv } from "./auth-lab";
import { handlePublicApi } from "./public-api";
import { handleLabCollections } from "./vip-lab";

export interface Env extends LabEnv {
  ASSETS: Fetcher;
}

const publicHeaders = {
  "Access-Control-Allow-Origin": "*",
  "X-Content-Type-Options": "nosniff",
};

function jsonError(error: string, status: number): Response {
  return Response.json(
    { error, statusCode: status },
    { status, headers: { ...publicHeaders, "Cache-Control": "no-store" } },
  );
}

async function publicCatalogAsset(request: Request, env: Env, assetPath: string, isVersion: boolean) {
  const url = new URL(request.url);
  const assetUrl = new URL(assetPath, url.origin);
  const source = await env.ASSETS.fetch(new Request(assetUrl, { method: "GET" }));
  if (!source.ok) {
    return jsonError(isVersion ? "CATALOG_NOT_READY" : "CATALOG_MONTH_NOT_FOUND", 404);
  }

  const etag = source.headers.get("ETag");
  const cacheControl = isVersion
    ? "no-cache, max-age=0, must-revalidate"
    : "public, max-age=10, stale-while-revalidate=30";
  const headers = new Headers(source.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", cacheControl);
  for (const [key, value] of Object.entries(publicHeaders)) headers.set(key, value);
  if (etag && request.headers.get("If-None-Match") === etag) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(source.body, { status: 200, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS" && url.pathname.startsWith("/api/catalog/")) {
      return new Response(null, {
        status: 204,
        headers: {
          ...publicHeaders,
          "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
          "Access-Control-Allow-Headers": "If-None-Match",
        },
      });
    }

    if (url.pathname === "/health" && request.method === "GET") {
      try {
        const result = await env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
        return Response.json(
          { service: "djgabo-migration-lab", database: result?.ok === 1 ? "ok" : "error" },
          { status: result?.ok === 1 ? 200 : 503, headers: { "Cache-Control": "no-store" } },
        );
      } catch {
        return Response.json(
          { service: "djgabo-migration-lab", database: "error" },
          { status: 503, headers: { "Cache-Control": "no-store" } },
        );
      }
    }

    const publicApiResponse = await handlePublicApi(request, url, env);
    if (publicApiResponse) return publicApiResponse;

    try {
      const vipLabResponse = await handleLabCollections(request, env, url);
      if (vipLabResponse) return vipLabResponse;

      const labAuthResponse = await handleLabAuth(request, env, url);
      if (labAuthResponse) return labAuthResponse;
    } catch (error) {
      // La cuota diaria de D1 puede agotarse: no devolver 500 ni
      // revelar rutas SQL o información interna al navegador.
      console.error("LAB_AUTH_STORAGE_UNAVAILABLE", error instanceof Error ? error.name : "unknown");
      return Response.json({
        error: "AUTH_STORAGE_UNAVAILABLE",
        message: "El acceso del laboratorio está temporalmente no disponible.",
        statusCode: 503,
      }, {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
          "Retry-After": "60",
        },
      });
    }

    if (request.method === "GET" && url.pathname === "/api/catalog/version.json") {
      return publicCatalogAsset(request, env, "/version.json", true);
    }

    if (request.method === "GET") {
      const match = /^\/api\/catalog\/(20\d{2})\/(0[0-9]|1[0-2])\/index\.json$/.exec(url.pathname);
      if (match) {
        const year = Number(match[1]);
        const month = Number(match[2]);
        const path = "/" + year + "/" + String(month).padStart(2, "0") + "/index.json";
        return publicCatalogAsset(request, env, path, false);
      }
    }

    // Los endpoints de autenticación, cuotas, descarga y administración
    // NO deben estar disponibles hasta completar políticas y controles.
    return jsonError("MIGRATION_LAB_ROUTE_DISABLED", 404);
  },
};
