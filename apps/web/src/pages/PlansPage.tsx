import { Check, Crown } from "lucide-react";
import { Link } from "react-router-dom";
import { VipShell } from "../components/VipShell";

const plans = [
  {
    name: "1 MES",
    price: "29.99",
    period: "/ mes",
    description: "Prueba el acceso VIP durante 30 días y descarga nuevas actualizaciones.",
    items: [
      "3 descargas VIP",
      "3 colecciones de actualizaciones",
      "3 karaokes a pedido",
      "Guarda en tu Dropbox",
    ],
  },
  {
    name: "6 MESES",
    price: "109.99",
    period: "/ 6 meses",
    description: "Mantén tu colección actualizada durante 6 meses con acceso continuo.",
    featured: true,
    items: [
      "Actualizaciones 2026",
      "Nuevos lanzamientos",
      "5 karaokes a pedido por mes",
      "Descargas ilimitadas",
    ],
  },
  {
    name: "1 AÑO",
    price: "169.99",
    period: "/ año",
    description: "Acceso VIP extendido para mantener tu repertorio al día todo el año.",
    items: [
      "Actualizaciones 2026–2012",
      "Nuevos lanzamientos",
      "15 karaokes a pedido por mes",
      "Descargas ilimitadas",
    ],
  },
];

export default function PlansPage() {
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
            Actualiza tu colección con nuevos karaokes
          </h2>

          <div className="mx-auto mt-6 flex max-w-[900px] flex-wrap items-stretch justify-center gap-5">
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

                <button
                  className={`mt-5 rounded-md py-2.5 text-[13px] font-semibold transition hover:brightness-95 ${plan.featured ? "bg-primary text-black" : "border border-white/[0.08] bg-secondary text-foreground"}`}
                >
                  Suscribirme
                </button>
              </article>
            ))}
          </div>

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
