import type { FastifyInstance } from "fastify";

export async function registerCatalogRoutes(fastify: FastifyInstance) {
  fastify.get("/api/catalog/version.json", async (request, reply) => {
    try {
      const { doc, etag } = await fastify.catalogJsonService.readVersion();
      if (request.headers["if-none-match"] === etag) return reply.code(304).send();
      reply.header("ETag", etag);
      reply.header("Cache-Control", "no-cache, max-age=0, must-revalidate");
      return reply.send(doc);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return reply.code(404).send({ error: "CATALOG_NOT_READY" });
      throw error;
    }
  });

  fastify.get<{ Params: { year: string; month: string } }>(
    "/api/catalog/:year/:month/index.json",
    async (request, reply) => {
      const year = Number(request.params.year);
      const month = Number(request.params.month);
      if (!Number.isInteger(year) || !Number.isInteger(month) || month < 0 || month > 12) {
        return reply.code(400).send({ error: "INVALID_YEAR_MONTH" });
      }

      try {
        const { doc, etag } = await fastify.catalogJsonService.readMonth(year, month);
        if (request.headers["if-none-match"] === etag) return reply.code(304).send();
        reply.header("ETag", etag);
        reply.header("Cache-Control", "public, max-age=10, stale-while-revalidate=30");
        return reply.send(doc);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT") return reply.code(404).send({ error: "CATALOG_MONTH_NOT_FOUND" });
        throw error;
      }
    },
  );
}
