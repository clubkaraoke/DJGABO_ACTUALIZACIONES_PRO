import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, asc } from "drizzle-orm";
import { plans } from "../../db/schema.js";
import { createId } from "../../db/id.js";
import { sqliteClient } from "../../db/client.js";
import { getPlanOffer, listPlanOffers, customBenefitLines } from "../../services/planOffers.js";

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

  const marketingSchema = z.object({
    title: z.string().min(2).max(60),
    price: z.string().regex(/^\d{1,5}\.\d{2}$/),
    description: z.string().min(1).max(240),
    items: z.array(z.string().min(1).max(180)).min(1).max(10),
    annualBonus: z.string().max(240).nullable().optional(),
    freeRequestsPerMonth: z.number().int().min(0).max(500).optional(),
  });
  const approved=["pro-mensual","pro-semestral","pro-anual"];
  fastify.get("/api/public/plan-offers",async()=>listPlanOffers(db));
  fastify.get("/api/admin/plan-offers",guard,async()=>listPlanOffers(db));
  fastify.patch<{Params:{slug:string}}>("/api/admin/plan-offers/:slug",guard,async(request,reply)=>{
    if (!approved.includes(request.params.slug))return reply.code(404).send({error:"PLAN_NOT_FOUND"});
    const parsed=marketingSchema.safeParse(request.body);
    if(!parsed.success)return reply.code(400).send({error:"INVALID_MARKETING",message:"Revisa precios, descripciones y pedidos gratis"});
    const data=parsed.data, sql=sqliteClient(db);
    const existing=getPlanOffer(db,request.params.slug);
    if(!existing)return reply.code(404).send({error:"PLAN_NOT_FOUND"});
    // Existing clients and all interfaces use the same integer limit, never infer it from editable prose again.
    const count=data.freeRequestsPerMonth??existing.freeRequestsPerMonth;
    const customItems=customBenefitLines(data.items);
    let bonus=data.annualBonus??null;
    if(request.params.slug==="pro-anual" && bonus && /\b\d+\s+karaokes?\b/i.test(bonus)){
      bonus=bonus.replace(/\b\d+(?=\s+karaokes?\b)/i,"{{totalAnual}}");
    }
    sql.prepare("UPDATE plan_marketing SET title=?,price=?,description=?,items=?,annual_bonus=?,free_requests_per_month=?,updated_at=? WHERE slug=?")
      .run(data.title,data.price,data.description,JSON.stringify(customItems),bonus,count,Date.now(),request.params.slug);
    const plan=await db.query.plans.findFirst({where:eq(plans.slug,request.params.slug)});
    if(plan)await db.update(plans).set({name:data.title+" · US$"+data.price,description:data.description,updatedAt:new Date()}).where(eq(plans.id,plan.id));
    return reply.send(getPlanOffer(db,request.params.slug));
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
