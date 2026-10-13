import { Check, Crown } from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/apiClient";
import { VipShell } from "../components/VipShell";
import { planSubscriptionWhatsappUrl } from "../lib/planWhatsApp";

interface Offer {slug:string;title:string;price:string;period:string;description:string;items:string[];annualBonus:string|null}
export default function PlansPage() {
  const {data,isLoading,isError}=useQuery({queryKey:["public","plan-offers"],queryFn:()=>api.get<Offer[]>("/public/plan-offers"),staleTime:60000});
  const plans=(data?.length===3 ? data.map((o,i)=>({name:o.title,price:o.price,period:o.period,description:o.description,items:o.items,featured:i===1,annualBonus:o.annualBonus})) : []);
  const availabilityError=isError || (!isLoading && plans.length===0);
  return (
    <VipShell>
      <div className="mx-auto w-full max-w-[1120px]">
        <section className="pb-6 pt-1">
          <div className="mb-2 inline-flex items-center gap-1.5 font-mono text-[10px] font-bold tracking-wider text-primary">
            <Crown className="h-3.5 w-3.5" /> MEMBRESÍA VIP
          </div>
          <h1 className="text-2xl font-black md:text-[28px]">
            Planes y Precios — Actualizaciones Karaoke
          </h1>
          <p className="mt-2 max-w-[720px] text-[13px] leading-6 text-muted-foreground md:text-[14px]">
            Mantén tu colección al día con nuevos karaokes y entregas DJGABO. Ideal si ya cuentas con una base de karaoke y quieres seguir actualizándola.
          </p>
        </section>

        <div className="border-t border-white/[0.06]" />

        <section className="px-0 py-8 md:py-10">
          <h2 className="text-center text-[18px] font-bold">
            Elige tu membresía VIP
          </h2>
          <p className="mt-1.5 text-center text-[12px] text-muted-foreground">
            Nuevas actualizaciones y karaokes a pedido para tu repertorio.
          </p>

          <div className="mx-auto mt-6 flex max-w-[900px] flex-wrap items-stretch justify-center gap-5">
            {isLoading && <p className="py-12 text-center text-sm text-muted-foreground">Cargando los planes VIP actualizados…</p>}
            {availabilityError && <p role="alert" className="py-12 text-center text-sm text-muted-foreground">No pudimos cargar los planes en este momento. Actualiza la página para consultar precios y beneficios vigentes.</p>}
            {plans.map((plan) => (
              <article
                key={plan.name}
                className={`relative flex w-full max-w-[285px] flex-col rounded-[10px] bg-card px-5 pb-5 pt-6 ${plan.featured ? "border border-primary" : "border border-white/[0.07]"}`}
              >
                {plan.featured && (
                  <div className="absolute -top-[11px] left-1/2 w-[82%] -translate-x-1/2 rounded-full bg-primary py-1 text-center font-mono text-[10px] font-bold tracking-wide text-black">
                    MÁS POPULAR
                  </div>
                )}

                <div className="text-center font-mono text-[10px] font-bold tracking-[0.14em] text-muted-foreground">
                  {plan.name}
                </div>

                <div className="mt-4 flex items-baseline justify-center gap-1.5">
                  <span className="font-mono text-[30px] font-black leading-none">
                    ${plan.price}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    USD {plan.period}
                  </span>
                </div>

                <p className="mx-auto mt-4 min-h-[54px] max-w-[235px] text-center text-[11px] leading-[18px] text-muted-foreground">
                  {plan.description}
                </p>

                <div className="my-4 border-t border-white/[0.07]" />

                <ul className="flex-1 space-y-2.5">
                  {plan.items.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-[12px] font-medium leading-5">
                      <Check className="mt-[3px] h-3.5 w-3.5 shrink-0 rounded-full text-primary" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>

                {"annualBonus" in plan && plan.annualBonus && (
                  <p className="mt-3 rounded-[5px] border border-primary/20 bg-primary/[0.09] px-2.5 py-2 text-center text-[11px] font-bold leading-4 text-primary">
                    {plan.annualBonus}
                  </p>
                )}

                <a href={planSubscriptionWhatsappUrl(plan)} target="_blank" rel="noopener noreferrer" aria-label={"Suscribirme por WhatsApp: "+plan.name}
                  className={`mt-5 rounded-md py-2.5 text-[13px] font-semibold transition hover:brightness-95 ${plan.featured ? "bg-primary text-black" : "border border-white/[0.08] bg-secondary text-foreground"}`}
                >
                  Suscribirme
                </a>
              </article>
            ))}
          </div>

          <p className="mx-auto mt-4 max-w-[760px] text-center text-[11px] leading-5 text-muted-foreground">
            Todos los planes permiten visualizar el catálogo y escuchar demos.
            Las descargas se realizan por carpeta completa: máximo 2 por carpeta al día y 5 carpetas diferentes por día, salvo límites particulares.
            Los pedidos gratis son mensuales, no acumulables, y corresponden a nuevas solicitudes.
            Cada enlace de descarga dura 90 segundos y es de un solo uso.
          </p>
          <div className="mt-6 text-center">
            <Link to="/panel" className="text-[12px] font-medium text-primary hover:underline">
              ← Volver al panel
            </Link>
          </div>
        </section>
      </div>
    </VipShell>
  );
}
