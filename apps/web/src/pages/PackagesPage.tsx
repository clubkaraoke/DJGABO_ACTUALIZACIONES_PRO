import type { ReactNode } from "react";
import { Check, FolderOpen } from "lucide-react";
import { VipShell } from "../components/VipShell";

function Benefit({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-[12px] font-medium leading-5">
      <Check className="mt-[3px] h-3.5 w-3.5 shrink-0 text-primary" />
      <span>{children}</span>
    </li>
  );
}

function Detail({ children }: { children: ReactNode }) {
  return <p className="ml-[22px] mt-0.5 text-[10px] leading-[17px] text-muted-foreground">{children}</p>;
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="mt-4 border-t border-white/[0.07] pt-3 text-[11px] font-extrabold text-foreground">
      {children}
    </div>
  );
}

function Feature({ children, detail }: { children: ReactNode; detail?: ReactNode }) {
  return (
    <div className="mt-2.5">
      <div className="flex items-start gap-2 text-[11px] font-semibold leading-5">
        <Check className="mt-[3px] h-3.5 w-3.5 shrink-0 text-primary" />
        <span>{children}</span>
      </div>
      {detail ? <Detail>{detail}</Detail> : null}
    </div>
  );
}

export default function PackagesPage() {
  return (
    <VipShell>
      <div className="mx-auto w-full max-w-[1120px]">
        <section className="pb-6 pt-1">
          <div className="mb-2 inline-flex items-center gap-1.5 font-mono text-[10px] font-bold tracking-wider text-primary">
            <FolderOpen className="h-3.5 w-3.5" /> PACKS KARAOKE
          </div>
          <h1 className="text-2xl font-black md:text-[28px]">
            Paquetes karaoke para Fiesta en casa, Eventos o Bares
          </h1>
          <p className="mt-2 max-w-[760px] text-[13px] leading-6 text-muted-foreground">
            Colecciones karaoke ordenadas y catalogadas en formatos MP4 y CDG, con herramientas profesionales DJGABO.
          </p>
        </section>

        <div className="border-t border-white/[0.06]" />

        <section className="px-0 py-8 md:py-10">
          <div className="mx-auto flex max-w-[940px] flex-wrap items-stretch justify-center gap-5">
            <article className="flex w-full max-w-[285px] flex-col rounded-[10px] border border-white/[0.07] bg-card px-5 pb-5 pt-6">
              <div className="text-center font-mono text-[10px] font-bold tracking-[0.14em] text-muted-foreground">BASIC</div>
              <div className="mt-4 flex items-baseline justify-center gap-1.5">
                <span className="font-mono text-[30px] font-black leading-none">$49</span>
                <span className="font-mono text-[10px] text-muted-foreground">USD · 150 GB</span>
              </div>
              <p className="mx-auto mt-4 min-h-[38px] max-w-[230px] text-center text-[11px] leading-[18px] text-muted-foreground">
                Perfecto para cantar en casa y reuniones pequeñas.
              </p>
              <div className="my-4 border-t border-white/[0.07]" />
              <ul className="flex-1 space-y-2.5">
                <Benefit>10.000 Karaokes español MP4</Benefit>
                <Benefit>4.000 Karaokes inglés MP4</Benefit>
                <Benefit>Géneros variados</Benefit>
              </ul>
              <button className="mt-5 rounded-md border border-white/[0.08] bg-secondary py-2.5 text-[13px] font-semibold">
                Consultar paquete
              </button>
            </article>

            <article className="relative flex w-full max-w-[305px] flex-col rounded-[10px] border border-primary bg-card px-5 pb-5 pt-6">
              <div className="absolute -top-[11px] left-1/2 w-[82%] -translate-x-1/2 rounded-full bg-primary py-1 text-center font-mono text-[10px] font-bold tracking-wide text-black">
                MÁS POPULAR
              </div>
              <div className="text-center font-mono text-[10px] font-bold tracking-[0.14em] text-muted-foreground">PRO</div>
              <div className="mt-4 flex items-baseline justify-center gap-1.5">
                <span className="font-mono text-[30px] font-black leading-none">$249</span>
                <span className="font-mono text-[10px] text-muted-foreground">USD · 300 GB</span>
              </div>
              <p className="mx-auto mt-4 min-h-[38px] max-w-[240px] text-center text-[11px] leading-[18px] text-muted-foreground">
                Ideal para DJs y fiestas grandes o eventos.
              </p>
              <div className="my-4 border-t border-white/[0.07]" />

              <ul className="space-y-2.5">
                <Benefit>28.000 Karaokes español MP3+G</Benefit>
                <Benefit>4.000 Karaokes inglés MP3+G</Benefit>
                <Benefit>5.000 Top Hits 2026-2021</Benefit>
              </ul>

              <SectionTitle>Herramientas Pro</SectionTitle>
              <Feature detail="Cambia el tono de las canciones para adaptarlas a cada voz.">Reproductor Karaoke</Feature>
              <Feature detail="Encuentra tus karaokes en segundos desde tu PC o un disco duro externo.">Buscador Karaoke</Feature>

              <SectionTitle>Acceso VIP</SectionTitle>
              <Feature detail="Incluidos gratis.">6 meses de actualizaciones</Feature>
              <Feature detail="Incluidos gratis.">5 karaokes a pedido por mes</Feature>

              <button className="mt-5 rounded-md bg-primary py-2.5 text-[13px] font-semibold text-black">
                Consultar paquete
              </button>
            </article>

            <article className="flex w-full max-w-[325px] flex-col rounded-[10px] border border-white/[0.07] bg-card px-5 pb-5 pt-6">
              <div className="text-center font-mono text-[10px] font-bold tracking-[0.14em] text-muted-foreground">PREMIUM</div>
              <div className="mt-4 flex items-baseline justify-center gap-1.5">
                <span className="font-mono text-[30px] font-black leading-none">$349</span>
                <span className="font-mono text-[10px] text-muted-foreground">USD · 800 GB</span>
              </div>
              <p className="mx-auto mt-4 min-h-[38px] max-w-[250px] text-center text-[11px] leading-[18px] text-muted-foreground">
                Ideal para bares y karaokes que buscan el repertorio más completo.
              </p>
              <div className="my-4 border-t border-white/[0.07]" />

              <ul className="space-y-2.5">
                <Benefit>28.000 Karaokes español MP3+G</Benefit>
                <Benefit>28.000 Karaokes inglés MP3+G</Benefit>
                <Benefit>5.000 Top Hits 2026-2021</Benefit>
              </ul>

              <SectionTitle>Extras Premium</SectionTitle>
              <Feature detail="Francés, italiano, portugués y japonés.">1.500 Karaokes Internacionales</Feature>
              <Feature detail="Salsas y cumbias exclusivas para ampliar tu repertorio.">2.000 Karaokes Extras Gold</Feature>

              <SectionTitle>Herramientas Pro</SectionTitle>
              <Feature detail="Cambia el tono de las canciones para adaptarlas a cada voz.">Reproductor Karaoke</Feature>
              <Feature detail="Encuentra tus karaokes en segundos desde tu PC o un disco duro externo.">Buscador Karaoke</Feature>
              <Feature detail="Recibe solicitudes de tus clientes directamente en WhatsApp.">Sistema de Pedidos de Canciones</Feature>

              <SectionTitle>Acceso VIP</SectionTitle>
              <Feature detail="Incluidos gratis.">12 meses de actualizaciones</Feature>
              <Feature detail="Incluidos gratis.">15 karaokes a pedido por mes</Feature>

              <button className="mt-5 rounded-md border border-white/[0.08] bg-secondary py-2.5 text-[13px] font-semibold">
                Consultar paquete
              </button>
            </article>
          </div>
        </section>
      </div>
    </VipShell>
  );
}
