import { Check, Crown } from "lucide-react";
import { Link } from "react-router-dom";
import { VipShell } from "../components/VipShell";

const plans = [
  {
    name: "1 MES",
    price: "59.99",
    period: "/ mes",
    description: "Ve todo el catálogo y descarga 3 carpetas de actualizaciones de 2026 durante 30 días.",
    items: [
      "Visualiza todo el catálogo y escucha demos",
      "Elige 3 carpetas diferentes de 2026",
      "2 descargas por carpeta al día",
      "Enlaces protegidos y control de dispositivos",
    ],
  },
  {
    name: "6 MESES",
    price: "139.99",
    period: "/ 6 meses",
    description: "Descarga todo el año de compra y recibe seis meses de nuevas actualizaciones.",
    featured: true,
    items: [
      "Todas las carpetas del año de compra",
      "6 meses de nuevas actualizaciones",
      "Visualiza el catálogo de todos los años",
      "Límite antiabuso: 2 descargas por carpeta/día",
    ],
  },
  {
    name: "1 AÑO",
    price: "179.99",
    period: "/ año",
    description: "Todas las colecciones históricas y las nuevas publicaciones durante 12 meses.",
    items: [
      "Todas las colecciones disponibles desde 2012",
      "12 meses de nuevas actualizaciones",
      "Acceso completo al catálogo histórico",
      "Límite antiabuso: 2 descargas por carpeta/día",
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

          <p className="mx-auto mt-4 max-w-[760px] text-center text-[11px] leading-5 text-muted-foreground">
            En todos los planes: máximo 2 descargas por carpeta al día y 5 carpetas diferentes al día, salvo límite particular del plan.
            Cada enlace de descarga dura 90 segundos y es de un solo uso. Las descargas individuales están sujetas al control del administrador.
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
