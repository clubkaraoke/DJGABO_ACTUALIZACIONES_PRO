import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, asc } from "drizzle-orm";
import { plans } from "../../db/schema.js";
import { createId } from "../../db/id.js";
import { sqliteClient } from "../../db/client.js";

const planSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().optional(),
  active: z.boolean().default(true),
  maxDevices: z.number().int().min(1).max(20).default(2),
  maxCollectionDownloadsPerDay: z.number().int().min(1).max(20).default(2),
  maxDistinctCollectionsPerDay: z.number().int().min(1).max(50).default(5),
  maxSelectedCollections: z.number().int().min(1).max(500).nullable().optional(),
});

export async function registerAdminPlansRoutes(fastify: FastifyInstance) {
  const { db } = fastify;
  const guard = { preHandler: [fastify.authenticate, fastify.requireRole("ADMIN")] };

  fastify.get("/api/admin/plans", guard, async (_request, reply) => {
    const allPlans = await db.query.plans.findMany({ orderBy: asc(plans.name) });
    return reply.send(allPlans.filter(p=>p.slug==="pro-mensual"||p.slug==="pro-semestral"||p.slug==="pro-anual"));
  });

  const marketingSchema=z.object({title:z.string().min(2).max(60),price:z.string().regex(/^\d{1,5}\.\d{2}$/),description:z.string().min(1).max(240),items:z.array(z.string().min(1).max(180)).min(1).max(10),annualBonus:z.string().max(240).nullable().optional()});
  const slugs=["pro-mensual","pro-semestral","pro-anual"];
  const readMarketing=()=> (sqliteClient(db).prepare("SELECT * FROM plan_marketing ORDER BY CASE slug WHEN 'pro-mensual' THEN 1 WHEN 'pro-semestral' THEN 2 ELSE 3 END").all() as Array<{slug:string;title:string;price:string;period:string;description:string;items:string;annual_bonus:string|null}>)
    .map(o=>({slug:o.slug,title:o.title,price:o.price,period:o.period,description:o.description,items:JSON.parse(o.items) as string[],annualBonus:o.annual_bonus}));
  fastify.get("/api/public/plan-offers",async()=>readMarketing());
  fastify.get("/api/admin/plan-offers",guard,async()=>readMarketing());
  fastify.patch<{Params:{slug:string}}>("/api/admin/plan-offers/:slug",guard,async(request,reply)=>{
    if(!slugs.includes(request.params.slug))return reply.code(404).send({error:"PLAN_NOT_FOUND"});
    const p=marketingSchema.safeParse(request.body);if(!p.success)return reply.code(400).send({error:"INVALID_MARKETING",message:"Revisa precio y descripciones"});
    const dbSql=sqliteClient(db);
    dbSql.prepare("UPDATE plan_marketing SET title=?,price=?,description=?,items=?,annual_bonus=?,updated_at=? WHERE slug=?")
      .run(p.data.title,p.data.price,p.data.description,JSON.stringify(p.data.items),p.data.annualBonus??null,Date.now(),request.params.slug);
    const plan=await db.query.plans.findFirst({where:eq(plans.slug,request.params.slug)});
    if(plan)await db.update(plans).set({name:p.data.title+" · US$"+p.data.price,description:p.data.description,updatedAt:new Date()}).where(eq(plans.id,plan.id));
    return reply.send(readMarketing().find(x=>x.slug===request.params.slug));
  });

  fastify.post("/api/admin/plans", guard, async (request, reply) => {
    const parsed = planSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "INVALID_INPUT", message: "Datos de plan inválidos", statusCode: 400 });
    }
    const now = new Date();
    const id = createId("plan");
    await db.insert(plans).values({ id, ...parsed.data, createdAt: now, updatedAt: now });
    const plan = await db.query.plans.findFirst({ where: eq(plans.id, id) });
    return reply.code(201).send(plan);
  });

  fastify.patch<{ Params: { id: string } }>("/api/admin/plans/:id", guard, async (request, reply) => {
    const parsed = planSchema.partial().safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "INVALID_INPUT", message: "Datos de plan inválidos", statusCode: 400 });
    }
    await db.update(plans).set({ ...parsed.data, updatedAt: new Date() }).where(eq(plans.id, request.params.id));
    const plan = await db.query.plans.findFirst({ where: eq(plans.id, request.params.id) });
    return reply.send(plan);
  });
}
