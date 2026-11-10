/**
 * Skeleton estrictamente aislado de Cloudflare Worker.
 * NO expone endpoints comerciales; solo verifica el enlace a D1.
 * Nunca devolver metadatos de tablas ni secretos en respuestas públicas.
 */
export interface Env {
  DB: D1Database;
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health" && request.method === "GET") {
      try {
        const result = await env.DB.prepare("SELECT 1 AS ok").first<{ok:number}>();
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
    return new Response("Migración en preparación. Sin endpoints comerciales.", {
      status: 404, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
    });
  },
};
