import { Check, Crown } from "lucide-react";
import { Link } from "react-router-dom";
import { VipShell } from "../components/VipShell";

const plans = [
  {
    name: "1 Mes",
    price: "29.99",
    period: "/ mes",
    items: [
      "3 descargas VIP",
      "Acceso a 3 colecciones de actualizaciones",
      "3 karaokes a pedido GRATIS en CDG",
      "1 guarda en tu Dropbox",
    ],
  },
  {
    name: "6 Meses",
    price: "109.99",
    period: "/ 6 meses",
    featured: true,
    items: [
      "Acceso a todas las actualizaciones 2026",
      "6 meses de nuevas actualizaciones",
      "Acceso a nuevos lanzamientos",
      "5 karaokes a pedido GRATIS por mes",
      "Descargas ilimitadas mientras tu plan esté activo",
    ],
  },
  {
    name: "1 Año",
    price: "169.99",
    period: "/ año",
    items: [
      "Acceso a actualizaciones 2026-2012",
      "12 meses de nuevas actualizaciones",
      "Acceso a nuevos lanzamientos",
      "15 karaokes a pedido GRATIS por mes",
      "Descargas ilimitadas mientras tu plan esté activo",
    ],
  },
];

export default function PlansPage() {
  return (
    <VipShell>
      <div className="space-y-5">
        <div>
          <div className="mb-2 inline-flex items-center gap-1.5 font-mono text-[11px] font-bold tracking-wider text-primary">
            <Crown className="h-3.5 w-3.5" /> MEMBRESÍA VIP
          </div>

          <h1 className="text-2xl font-black">
            Planes y Precios — Actualizaciones Karaoke
          </h1>

          <div className="mt-3 max-w-3xl space-y-1.5">
            <p className="text-[14px] font-semibold leading-6 text-foreground">
              Actualiza tu colección con nuevos karaokes cada mes.
            </p>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              Accede a las nuevas entregas DJGABO, karaokes a pedido y beneficios exclusivos según tu plan.
            </p>
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              Pensado para clientes que ya tienen una colección de karaoke y quieren mantenerla al día.
            </p>
          </div>
        </div>

        <div className="border-t border-white/[0.06]" />

        <div className="text-center">
          <h2 className="text-lg font-bold">
            Nuevos karaokes. Nuevas entregas. Tu colección siempre al día.
          </h2>
          <p className="mx-auto mt-1 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
            Elige cuánto tiempo quieres mantener activo tu acceso VIP y descarga las actualizaciones incluidas en tu plan.
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-5">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative flex w-full max-w-[285px] flex-col rounded-[10px] bg-card p-5 ${plan.featured ? "border border-primary" : "border border-white/[0.06]"}`}
            >
              {plan.featured && (
                <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-primary px-2.5 py-0.5 font-mono text-[10px] font-bold text-black">
                  MÁS POPULAR
                </div>
              )}

              <div className="mb-1 text-[13px] font-semibold">{plan.name}</div>

              <div className="mb-4 flex items-baseline gap-1">
                <span className="font-mono text-2xl font-black">${plan.price}</span>
                <span className="font-mono text-[12px] text-muted-foreground">
                  USD {plan.period}
                </span>
              </div>

              <ul className="mb-5 flex-1 space-y-2">
                {plan.items.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-[12px] leading-5">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <button
                className={`${plan.featured ? "bg-primary text-black" : "border border-white/[0.06] bg-secondary"} rounded-md py-2.5 text-[13px] font-semibold`}
              >
                Suscribirme
              </button>
            </div>
          ))}
        </div>

        <div className="text-center">
          <Link to="/panel" className="text-[13px] text-primary hover:underline">
            ← Volver al panel
          </Link>
        </div>
      </div>
    </VipShell>
  );
}
